import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service - StancePro",
  description: "StancePro Terms of Service - Rules and guidelines for using our service.",
};

export default function TermsPage() {
  return (
    <div className="container mx-auto px-6 py-20">
      <div className="max-w-3xl mx-auto prose prose-invert prose-slate">
        <h1 className="text-4xl font-bold mb-8">Terms of Service</h1>
        <p className="text-slate-400 mb-8">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">1. Agreement to Terms</h2>
          <p className="text-slate-300">
            By accessing or using StancePro (&quot;the Service&quot;), you agree to be bound by these Terms of Service. 
            If you do not agree to these terms, please do not use the Service.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">2. Description of Service</h2>
          <p className="text-slate-300 mb-4">
            StancePro is a mobile application and web service that provides:
          </p>
          <ul className="list-disc pl-6 text-slate-300 space-y-2">
            <li>Snowboard and ski stance calculations and recommendations</li>
            <li>Equipment database and compatibility information</li>
            <li>Video coaching services</li>
            <li>Community features (Field Talks, Reviews)</li>
            <li>Pro rider setup comparisons</li>
          </ul>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">3. User Accounts</h2>
          <p className="text-slate-300 mb-4">
            To access certain features, you must create an account. You are responsible for:
          </p>
          <ul className="list-disc pl-6 text-slate-300 space-y-2">
            <li>Maintaining the confidentiality of your account credentials</li>
            <li>All activities that occur under your account</li>
            <li>Providing accurate and complete information</li>
            <li>Notifying us immediately of any unauthorized use</li>
          </ul>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">4. Acceptable Use</h2>
          <p className="text-slate-300 mb-4">You agree not to:</p>
          <ul className="list-disc pl-6 text-slate-300 space-y-2">
            <li>Use the Service for any illegal purpose</li>
            <li>Harass, abuse, or harm other users</li>
            <li>Post offensive, inappropriate, or harmful content</li>
            <li>Impersonate others or misrepresent your affiliation</li>
            <li>Attempt to gain unauthorized access to the Service</li>
            <li>Interfere with or disrupt the Service</li>
            <li>Use automated tools to access the Service without permission</li>
            <li>Violate any applicable laws or regulations</li>
          </ul>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">5. User Content</h2>
          <p className="text-slate-300 mb-4">
            You retain ownership of content you create (videos, posts, reviews). By posting content, you grant us a 
            non-exclusive, worldwide, royalty-free license to use, display, and distribute your content within the Service.
          </p>
          <p className="text-slate-300">
            We reserve the right to remove any content that violates these terms or is otherwise objectionable.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">6. Video Coaching</h2>
          <p className="text-slate-300 mb-4">
            Our video coaching service connects you with independent coaches. Please note:
          </p>
          <ul className="list-disc pl-6 text-slate-300 space-y-2">
            <li>Coaches provide feedback based on their professional judgment</li>
            <li>Coaching feedback is for educational purposes only</li>
            <li>We do not guarantee specific results from coaching</li>
            <li>Videos shared with coaches are subject to our Privacy Policy</li>
          </ul>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">7. Disclaimers</h2>
          
          <h3 className="text-xl font-medium mb-3 text-amber-400">⚠️ Important Safety Notice</h3>
          <p className="text-slate-300 mb-4">
            <strong>DIN Settings:</strong> DIN release values calculated by this app are ESTIMATES ONLY and are NOT 
            safe for use without professional verification. DIN settings MUST be determined and set by a certified 
            ski technician according to ISO 11088 standards. Incorrect DIN settings can cause serious injury or death.
          </p>

          <h3 className="text-xl font-medium mb-3 text-brand-400">General Disclaimer</h3>
          <p className="text-slate-300 mb-4">
            Stance recommendations, equipment suggestions, and other guidance provided by StancePro are for 
            informational purposes only. Results may vary based on individual factors. Always consult with 
            qualified professionals and use your own judgment.
          </p>

          <p className="text-slate-300">
            THE SERVICE IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES OF ANY KIND. WE DISCLAIM ALL WARRANTIES, 
            EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">8. Limitation of Liability</h2>
          <p className="text-slate-300">
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, STANCEPRO SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, 
            SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO PERSONAL INJURY, PROPERTY 
            DAMAGE, LOSS OF DATA, OR LOSS OF PROFITS, ARISING FROM YOUR USE OF THE SERVICE.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">9. Subscriptions and Payments</h2>
          <p className="text-slate-300 mb-4">
            Some features require a paid subscription. By subscribing:
          </p>
          <ul className="list-disc pl-6 text-slate-300 space-y-2">
            <li>You authorize recurring charges to your payment method</li>
            <li>Subscriptions auto-renew unless cancelled</li>
            <li>Refunds are handled according to App Store / Google Play policies</li>
            <li>Prices may change with notice</li>
          </ul>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">10. Termination</h2>
          <p className="text-slate-300">
            We may terminate or suspend your account at any time for violations of these terms. 
            You may delete your account at any time through the app settings. Upon termination, 
            your right to use the Service ceases immediately.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">11. Changes to Terms</h2>
          <p className="text-slate-300">
            We reserve the right to modify these terms at any time. We will notify users of significant 
            changes. Continued use of the Service after changes constitutes acceptance of the new terms.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">12. Governing Law</h2>
          <p className="text-slate-300">
            These terms are governed by the laws of the jurisdiction in which StancePro operates, 
            without regard to conflict of law principles.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">13. Contact</h2>
          <p className="text-slate-300">
            For questions about these Terms of Service, please contact us at:
          </p>
          <p className="text-slate-300 mt-4">
            Email: <a href="mailto:legal@stance-pro.com" className="text-brand-400 hover:underline">legal@stance-pro.com</a>
          </p>
        </section>
      </div>
    </div>
  );
}







