"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { EmployeeForm, EmployeeData } from "../employee-form";

export default function EditEmployeePage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<(Partial<EmployeeData> & { id: string }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/employees/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ padding: 32 }}>Loading...</div>;
  if (!data) return <div style={{ padding: 32 }}>Employee not found.</div>;

  return <EmployeeForm initial={data} isEdit />;
}
