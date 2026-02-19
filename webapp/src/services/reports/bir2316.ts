/**
 * BIR 2316 Certificate of Compensation Payment / Tax Withheld
 * Faithful port of Bir2316Generator.txt — builds data + tag map for each employee.
 *
 * Preserves:
 * - 100+ tag mapping ({{YEAR}}, {{MF.*}}, {{ANN.*}}, MWE tags, component tags)
 * - Component classification from annualization
 * - MWE-specific tags (MWE_BP, MWE_OT, MWE_X, STAT_MIN_WAGE_DAY/MONTH)
 * - Short tag generation (8-10 char abbreviations)
 * - Period covered (FROM = max(hire, Jan 1), TO = separation or Dec 31)
 * - Non-tax category tags (NTDM_TOTAL, NTO_TOTAL)
 * - 13th month breakdown (OTHER13_TOTAL, OTHER13_NONTAX_90K, OTHER13_TAXABLE)
 */

import { r2, fmt2, sanitizeAscii, birFormatDate } from "../payroll-engine/helpers";
import { OTHER_BENEFITS_EXEMPT_YTD } from "@/lib/constants";
import type { FinalAnnResult, PreviousEmployerBreakdown } from "../annualization/types";
import type { Bir2316Data } from "./types";

interface EmployeeMasterDetail {
  tin: string;
  lastName: string;
  firstName: string;
  middleName: string;
  birthday: string;
  address: string;
  zipCode: string;
  dateHired: Date | null;
  dateSeparated: Date | null;
  payBasis: string;
  basicPay: number;
  workingDaysPerYear: number;
  nationality: string;
  isMwe: boolean;
}

interface CompanyInfo {
  tin: string;
  name: string;
  address: string;
  zipCode: string;
  authorizedRep: string;
  authorizedRepTin: string;
}

interface Bir2316Input {
  annualizationResults: FinalAnnResult[];
  employeeDetails: Map<string, EmployeeMasterDetail>;
  companyInfo: CompanyInfo;
  year: number;
  dateIssued?: string;
}

const SHORT_TAG_MAXLEN = 10;

function buildShortTag(header: string): string {
  const cleaned = header.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return cleaned.slice(0, SHORT_TAG_MAXLEN);
}

function splitTin(tin: string): { tin1: string; tin2: string; tin3: string; tin4: string } {
  const digits = (tin || "").replace(/\D/g, "");
  return {
    tin1: digits.slice(0, 3),
    tin2: digits.slice(3, 6),
    tin3: digits.slice(6, 9),
    tin4: digits.slice(9, 13) || "0000",
  };
}

function derivePeriodFrom(emp: EmployeeMasterDetail, year: number): Date {
  const jan1 = new Date(year, 0, 1);
  if (!emp.dateHired) return jan1;
  return emp.dateHired > jan1 ? emp.dateHired : jan1;
}

function derivePeriodTo(emp: EmployeeMasterDetail, year: number): Date {
  const dec31 = new Date(year, 11, 31);
  if (!emp.dateSeparated) return dec31;
  if (emp.dateSeparated.getFullYear() === year) return emp.dateSeparated;
  return dec31;
}

function computeSmwFields(emp: EmployeeMasterDetail): { perDay: number; perMonth: number } {
  const wdpy = emp.workingDaysPerYear || 261;
  const isDaily = emp.payBasis?.toUpperCase() === "DAILY";
  const perDay = isDaily ? emp.basicPay : r2((emp.basicPay * 12) / wdpy);
  const perMonth = isDaily ? r2(emp.basicPay * (wdpy / 12)) : emp.basicPay;
  return { perDay, perMonth };
}

function buildTagMap(
  ann: FinalAnnResult,
  emp: EmployeeMasterDetail,
  company: CompanyInfo,
  year: number,
  dateIssued: string
): Record<string, string> {
  const tags: Record<string, string> = {};

  // Meta tags
  tags["YEAR"] = String(year);
  tags["DATE_ISSUED"] = dateIssued;
  tags["CALENDAR_YEAR"] = String(year);

  // Company tags
  tags["EMPLOYER_TIN"] = company.tin;
  const empTin = splitTin(company.tin);
  tags["EMPLOYER_TIN1"] = empTin.tin1;
  tags["EMPLOYER_TIN2"] = empTin.tin2;
  tags["EMPLOYER_TIN3"] = empTin.tin3;
  tags["EMPLOYER_TIN4"] = empTin.tin4;
  tags["EMPLOYER_NAME"] = company.name;
  tags["EMPLOYER_ADDRESS"] = company.address;
  tags["EMPLOYER_ZIP"] = company.zipCode;
  tags["AUTHORIZED_REP"] = company.authorizedRep;
  tags["AUTHORIZED_REP_TIN"] = company.authorizedRepTin;

  // Employee masterfile tags
  tags["EMPLOYEE_NAME"] = ann.empName;
  tags["MF.LAST NAME"] = emp.lastName;
  tags["MF.FIRST NAME"] = emp.firstName;
  tags["MF.MIDDLE NAME"] = emp.middleName;
  tags["TIN"] = emp.tin;
  const eTin = splitTin(emp.tin);
  tags["TIN1"] = eTin.tin1;
  tags["TIN2"] = eTin.tin2;
  tags["TIN3"] = eTin.tin3;
  tags["TIN4"] = eTin.tin4;
  tags["BIRTHDAY"] = emp.birthday;
  tags["ADDRESS"] = emp.address;
  tags["ZIP_CODE"] = emp.zipCode;
  tags["NATIONALITY"] = emp.nationality;

  // Period tags
  const periodFrom = derivePeriodFrom(emp, year);
  const periodTo = derivePeriodTo(emp, year);
  tags["PERIOD_FROM"] = birFormatDate(periodFrom);
  tags["PERIOD_TO"] = birFormatDate(periodTo);

  // Annualization summary tags
  tags["GROSS_COMP_PRESENT"] = fmt2(ann.totalGrossCompPresent);
  tags["TOTAL_NONTAX_COMP"] = fmt2(ann.totalNonTaxableComp);
  tags["TAXABLE_COMP_PRESENT"] = fmt2(ann.totalTaxableComp);
  tags["TOTAL_COMP_INCOME"] = fmt2(ann.totalCompensationIncome);
  tags["TOTAL_NONTAX_INCOME"] = fmt2(ann.totalNonTaxableIncome);
  tags["TOTAL_TAXABLE_INCOME"] = fmt2(ann.totalTaxableIncome);
  tags["TOTAL_EXEMPTIONS"] = fmt2(ann.totalExemptions);
  tags["TAX_DUE"] = fmt2(ann.totalTaxDue);
  tags["TAX_WITHHELD"] = fmt2(ann.totalTaxWithheld);
  tags["TAX_DIFFERENCE"] = fmt2(ann.taxDifference);

  // Statutory contributions
  tags["SSS_EE_YTD"] = fmt2(ann.ytdSssEe);
  tags["PH_EE_YTD"] = fmt2(ann.ytdPhEe);
  tags["PI_EE_YTD"] = fmt2(ann.ytdPiEe);

  // Component category totals
  tags["BASIC_TOTAL"] = fmt2(ann.ytdBasic);
  tags["TAXABLE_EARN_TOTAL"] = fmt2(ann.ytdTaxableEarnings);
  tags["NTDM_TOTAL"] = fmt2(ann.ytdDeminimis);
  tags["NTO_TOTAL"] = fmt2(ann.ytdNonTaxOther);
  tags["OTHER13_TOTAL"] = fmt2(ann.ytd13thOther);

  // 13th month breakdown
  const nonTaxable13th = Math.min(ann.ytd13thOther, OTHER_BENEFITS_EXEMPT_YTD);
  const taxable13th = Math.max(0, ann.ytd13thOther - OTHER_BENEFITS_EXEMPT_YTD);
  tags["OTHER13_NONTAX_90K"] = fmt2(nonTaxable13th);
  tags["OTHER13_TAXABLE"] = fmt2(taxable13th);

  // MWE tags
  tags["MWE_X"] = ann.isMwe ? "X" : "";
  tags["MWE_BP"] = fmt2(ann.mweNonTaxBasic);
  tags["MWE_OT"] = fmt2(ann.mweNonTaxOvertime);
  tags["NMWE_BP"] = ann.isMwe ? "" : fmt2(ann.ytdBasic);
  tags["NMWE_OT"] = ann.isMwe ? "" : fmt2(ann.ytdOvertime);

  const smw = computeSmwFields(emp);
  tags["STAT_MIN_WAGE_DAY"] = ann.isMwe ? fmt2(smw.perDay) : "";
  tags["STAT_MIN_WAGE_MONTH"] = ann.isMwe ? fmt2(smw.perMonth) : "";

  // Previous employer tags
  const prev = ann.prevEmployer;
  tags["PREV_EMPLOYER_TIN"] = prev?.tin ?? "";
  tags["PREV_EMPLOYER_NAME"] = prev?.registeredName ?? "";
  tags["PREV_EMPLOYER_ADDRESS"] = prev?.address ?? "";
  tags["PREV_TAXABLE"] = fmt2(ann.prevEmployerTaxable);
  tags["PREV_WTAX"] = fmt2(ann.prevEmployerWtax);
  if (prev) {
    tags["PREV_NT_GROSS"] = fmt2(prev.nonTaxGrossCompIncome);
    tags["PREV_NT_BASIC_SMW"] = fmt2(prev.nonTaxBasicSmw);
    tags["PREV_NT_HOLIDAY"] = fmt2(prev.nonTaxHolidayPay);
    tags["PREV_NT_OT"] = fmt2(prev.nonTaxOvertimePay);
    tags["PREV_NT_ND"] = fmt2(prev.nonTaxNightDiff);
    tags["PREV_NT_HAZARD"] = fmt2(prev.nonTaxHazardPay);
    tags["PREV_NT_13TH"] = fmt2(prev.nonTax13thMonth);
    tags["PREV_NT_DEMINIMIS"] = fmt2(prev.nonTaxDeMinimis);
    tags["PREV_NT_SSS_ETC"] = fmt2(prev.nonTaxSssEtc);
    tags["PREV_NT_SALARIES"] = fmt2(prev.nonTaxSalaries);
    tags["PREV_TX_BASIC"] = fmt2(prev.taxableBasicSalary);
    tags["PREV_TX_13TH"] = fmt2(prev.taxable13thMonth);
    tags["PREV_TX_SALARIES"] = fmt2(prev.taxableSalaries);
  }

  // Component-level tags with short names
  for (const comp of ann.componentYtds) {
    const fullKey = `ANN.${comp.header.toUpperCase()}`;
    tags[fullKey] = fmt2(comp.ytdAmount);
    const shortKey = buildShortTag(comp.header);
    if (shortKey && shortKey !== fullKey) {
      tags[shortKey] = fmt2(comp.ytdAmount);
    }
  }

  return tags;
}

export function generateBir2316Data(input: Bir2316Input): Bir2316Data[] {
  const { annualizationResults, employeeDetails, companyInfo, year, dateIssued } = input;
  const issued = dateIssued || birFormatDate(new Date());
  const results: Bir2316Data[] = [];

  for (const ann of annualizationResults) {
    const emp = employeeDetails.get(ann.empId) || {
      tin: "", lastName: "", firstName: "", middleName: "",
      birthday: "", address: "", zipCode: "",
      dateHired: null, dateSeparated: null,
      payBasis: "MONTHLY", basicPay: 0, workingDaysPerYear: 261,
      nationality: "FILIPINO", isMwe: false,
    };

    const tags = buildTagMap(ann, emp, companyInfo, year, issued);
    const smw = computeSmwFields(emp);
    const periodFrom = derivePeriodFrom(emp, year);
    const periodTo = derivePeriodTo(emp, year);

    const nonTaxable13th = Math.min(ann.ytd13thOther, OTHER_BENEFITS_EXEMPT_YTD);
    const taxable13th = Math.max(0, ann.ytd13thOther - OTHER_BENEFITS_EXEMPT_YTD);

    results.push({
      empId: ann.empId,
      empName: ann.empName,
      tin: emp.tin,
      birthday: emp.birthday,
      address: emp.address,
      zipCode: emp.zipCode,

      employerTin: companyInfo.tin,
      employerName: companyInfo.name,
      employerAddress: companyInfo.address,
      employerZipCode: companyInfo.zipCode,

      totalCompensation: r2(ann.totalCompensationIncome),
      totalNonTaxable: r2(ann.totalNonTaxableIncome),
      totalTaxable: r2(ann.totalTaxableIncome),
      totalExemptions: r2(ann.totalExemptions),
      totalTaxDue: r2(ann.totalTaxDue),
      totalTaxWithheld: r2(ann.totalTaxWithheld),
      taxDifference: r2(ann.taxDifference),

      prevEmployerTaxable: r2(ann.prevEmployerTaxable),
      prevEmployerWtax: r2(ann.prevEmployerWtax),
      prevEmployer: ann.prevEmployer,

      sssContributions: r2(ann.ytdSssEe),
      philhealthContributions: r2(ann.ytdPhEe),
      pagibigContributions: r2(ann.ytdPiEe),

      isMwe: ann.isMwe,
      mweBp: r2(ann.mweNonTaxBasic),
      mweOt: r2(ann.mweNonTaxOvertime),
      nmweBp: ann.isMwe ? 0 : r2(ann.ytdBasic),
      nmweOt: ann.isMwe ? 0 : r2(ann.ytdOvertime),
      smwPerDay: ann.isMwe ? smw.perDay : 0,
      smwPerMonth: ann.isMwe ? smw.perMonth : 0,

      ytdBasic: r2(ann.ytdBasic),
      ytdTaxableEarnings: r2(ann.ytdTaxableEarnings),
      ytd13thOther: r2(ann.ytd13thOther),
      ytdDeminimis: r2(ann.ytdDeminimis),
      ytdNonTaxOther: r2(ann.ytdNonTaxOther),
      ytdOvertime: r2(ann.ytdOvertime),

      nonTaxable13th: r2(nonTaxable13th),
      taxable13th: r2(taxable13th),

      periodFrom: birFormatDate(periodFrom),
      periodTo: birFormatDate(periodTo),
      dateIssued: issued,
      year,

      tags,
    });
  }

  return results;
}

/**
 * Render a string template by replacing {{TAG}} placeholders (case-insensitive).
 */
function renderStringTemplate(template: string, tags: Record<string, string>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, key: string) => {
    const upper = key.trim().toUpperCase();
    for (const [tKey, tVal] of Object.entries(tags)) {
      if (tKey.toUpperCase() === upper) return tVal;
    }
    return "";
  });
}

/**
 * Get the catalog of all available tags for review.
 */
function getBir2316TagCatalog(sampleData: Bir2316Data | null): Record<string, string> {
  if (!sampleData) return {};
  return { ...sampleData.tags };
}
