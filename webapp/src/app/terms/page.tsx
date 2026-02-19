import Image from "next/image";

export const metadata = {
  title: "Netpay PH — Terms of Use & License",
};

export default function TermsPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 16px 48px" }}>
        <div className="card" style={{ padding: 28 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
            <Image
              src="/logo.png"
              alt="Netpay PH"
              width={220}
              height={50}
              style={{ objectFit: "contain" }}
              priority
            />
          </div>

          <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>
            Netpay PH — Terms of Use &amp; License
          </h1>
          <div style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 18 }}>
            Last updated: February 3, 2026
          </div>

          <div style={{ display: "grid", gap: 14, fontSize: 14, lineHeight: 1.65 }}>
            <section>
              <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>1. Ownership</h2>
              <p>
                Netpay PH and all related software, scripts, formulas, logic, documentation, and branding
                (the “Tool”) are the exclusive property of Proseso Outsourcing Services Inc. in the
                Philippines. The Tool is developed and operated by Proseso Consulting.
              </p>
            </section>

            <section>
              <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>2. License Grant</h2>
              <p>
                Subject to an active commercial agreement, Proseso Outsourcing Services Inc. grants the
                client a limited, non-exclusive, non-transferable, revocable license to use the Tool
                solely for the client’s internal business operations.
              </p>
            </section>

            <section>
              <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>3. Restrictions</h2>
              <p>The client shall not, directly or indirectly:</p>
              <ul style={{ paddingLeft: 18, marginTop: 6 }}>
                <li>Copy, duplicate, share, publish, or redistribute the Tool or any part of it</li>
                <li>Grant access to third parties outside the client’s organization</li>
                <li>Modify, adapt, translate, or create derivative works</li>
                <li>
                  Reverse engineer, decompile, or attempt to extract source code, formulas, or system
                  logic
                </li>
                <li>Remove or alter proprietary notices or ownership references</li>
              </ul>
            </section>

            <section>
              <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>4. Confidentiality</h2>
              <p>
                The Tool, including all technical and functional components, constitutes confidential
                and proprietary information and may include trade secrets of Proseso Outsourcing
                Services Inc. The client agrees to protect the Tool with the same level of care as its
                own confidential information, but not less than reasonable care.
              </p>
            </section>

            <section>
              <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>
                5. Access Control &amp; Suspension
              </h2>
              <p>
                Proseso Outsourcing Services Inc. reserves the right to suspend or revoke access to the
                Tool in the event of:
              </p>
              <ul style={{ paddingLeft: 18, marginTop: 6 }}>
                <li>Breach of these Terms</li>
                <li>Termination or expiration of the underlying service agreement</li>
                <li>Non-payment of applicable fees</li>
                <li>Suspected misuse or unauthorized distribution</li>
              </ul>
            </section>

            <section>
              <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>6. Data Responsibility</h2>
              <p>
                Client data entered into the Tool remains the property of the client. The client is
                responsible for ensuring the accuracy, legality, and compliance of all data processed
                using the Tool.
              </p>
            </section>

            <section>
              <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>7. No Warranty</h2>
              <p>
                The Tool is provided “as is” without warranties of any kind, express or implied,
                including but not limited to fitness for a particular purpose or regulatory compliance.
              </p>
            </section>

            <section>
              <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>
                8. Limitation of Liability
              </h2>
              <p>
                To the maximum extent permitted by law, Proseso Outsourcing Services Inc. shall not be
                liable for any indirect, incidental, special, or consequential damages arising from the
                use or inability to use the Tool.
              </p>
            </section>

            <section>
              <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>9. Audit &amp; Verification</h2>
              <p>
                Proseso Outsourcing Services Inc. reserves the right to reasonably verify compliance
                with these Terms, including validation of authorized users and access scope.
              </p>
            </section>

            <section>
              <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>10. Governing Law</h2>
              <p>
                These Terms shall be governed by and construed in accordance with the laws of the
                Republic of the Philippines.
              </p>
            </section>

            <section>
              <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>11. Acceptance</h2>
              <p>
                By accessing or using Netpay PH, the client acknowledges that they have read,
                understood, and agreed to these Terms of Use and License.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

