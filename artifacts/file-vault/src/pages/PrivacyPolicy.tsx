import { useLocation } from 'wouter';

export default function PrivacyPolicy() {
  const [, navigate] = useLocation();
  return (
    <div className="min-h-screen w-full bg-background">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <button
          onClick={() => navigate('/')}
          className="text-sm text-primary hover:underline mb-8"
        >
          ← Back to Doyang
        </button>

        <h1 className="text-3xl font-extrabold tracking-tight text-foreground mb-2">
          Privacy Policy
        </h1>
        <p className="text-sm text-muted-foreground mb-10">
          Effective date: July 12, 2026
        </p>

        <div className="space-y-8 text-foreground/90 leading-relaxed">
          <section>
            <p>
              Doyang ("we", "us", "our") operates a creditworthiness and marketplace
              platform based in Siaya, Kenya, connecting retailers, wholesalers, and
              buyers. This Privacy Policy explains what personal information we
              collect, how we use it, and the choices you have.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">1. Information We Collect</h2>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li><span className="text-foreground font-medium">Account information:</span> name, email address, phone number, business type, and authentication details when you sign up via email/password or Google.</li>
              <li><span className="text-foreground font-medium">Financial/transaction data:</span> M-Pesa statements you upload for credit analysis, including transaction history, amounts, and counterparties reflected in those statements.</li>
              <li><span className="text-foreground font-medium">Payment information:</span> mobile money numbers, tokenized card references (we never store full card numbers — only a token provided by our payment processor, Paystack), and bank account details for wholesalers/sellers receiving settlement.</li>
              <li><span className="text-foreground font-medium">Marketplace data:</span> product listings, orders, purchase history, hire-purchase agreements.</li>
              <li><span className="text-foreground font-medium">Communications:</span> messages sent to our AI assistant, support inquiries.</li>
              <li><span className="text-foreground font-medium">Usage data:</span> device/browser information and app interaction logs.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">2. How We Use Your Information</h2>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>To create and maintain your account</li>
              <li>To analyze M-Pesa statements and generate a creditworthiness score, grade, and recommended credit limit, shared according to your visibility settings</li>
              <li>To process payments, including mobile money (STK push) and card-based charges, via Paystack</li>
              <li>To facilitate loan offers between retailers and wholesalers, and hire-purchase agreements between sellers and buyers</li>
              <li>To send transactional emails (verification, password reset) via Resend</li>
              <li>To operate our AI chatbot assistant</li>
              <li>To detect fraud, prevent abuse, and comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">3. How We Share Your Information</h2>
            <p className="mb-3 text-muted-foreground">We do not sell your personal information. We share data with:</p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li><span className="text-foreground font-medium">Firebase (Google):</span> authentication and database hosting</li>
              <li><span className="text-foreground font-medium">Paystack:</span> payment processing, including M-Pesa STK push, card charges, and bank transfers</li>
              <li><span className="text-foreground font-medium">Resend:</span> transactional email delivery</li>
              <li><span className="text-foreground font-medium">OpenAI / OpenRouter:</span> AI-based statement analysis and chatbot responses</li>
              <li><span className="text-foreground font-medium">Wholesalers:</span> your credit report, based on the visibility settings you choose</li>
              <li><span className="text-foreground font-medium">Sellers/buyers:</span> order and delivery information necessary to complete a transaction</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">4. Data Retention</h2>
            <p className="text-muted-foreground">
              We retain your information for as long as your account is active or as
              needed to provide services, comply with legal obligations, resolve
              disputes, and enforce agreements.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">5. Your Rights</h2>
            <p className="mb-3 text-muted-foreground">
              Under the Kenya Data Protection Act, 2019, you have the right to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data, subject to legal retention requirements</li>
              <li>Object to or restrict certain processing</li>
              <li>Request a copy of your data in a portable format</li>
              <li>Withdraw consent where processing is based on consent</li>
            </ul>
            <p className="mt-3 text-muted-foreground">
              To exercise these rights, contact us at{' '}
              <a href="mailto:jamesodero40@gmail.com" className="text-primary hover:underline">
                jamesodero40@gmail.com
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">6. Data Security</h2>
            <p className="text-muted-foreground">
              We use industry-standard measures, including encrypted connections and
              access controls, to protect your information. However, no method of
              transmission or storage is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">7. Children's Privacy</h2>
            <p className="text-muted-foreground">
              Doyang is not intended for individuals under 18 years of age. We do not
              knowingly collect data from children.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">8. International Data Transfers</h2>
            <p className="text-muted-foreground">
              Some of our service providers (Firebase, Paystack, OpenAI/OpenRouter,
              Resend) may process data outside Kenya. We take steps to ensure such
              transfers are subject to appropriate safeguards.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">9. Changes to This Policy</h2>
            <p className="text-muted-foreground">
              We may update this Privacy Policy from time to time. We will notify you
              of material changes by updating the effective date above.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">10. Contact Us</h2>
            <p className="text-muted-foreground">
              Doyang<br />
              Siaya, Kenya<br />
              Email: <a href="mailto:jamesodero40@gmail.com" className="text-primary hover:underline">jamesodero40@gmail.com</a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
