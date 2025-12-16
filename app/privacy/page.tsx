import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - StancePro",
  description: "StancePro Privacy Policy - How we collect, use, and protect your data.",
};

export default function PrivacyPage() {
  return (
    <div className="container mx-auto px-6 py-20">
      <div className="max-w-3xl mx-auto prose prose-invert prose-slate">
        <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>
        <p className="text-slate-400 mb-8">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
          <p className="text-slate-300 mb-4">
            StancePro (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to protecting your privacy. 
            This Privacy Policy explains how we collect, use, disclose, and safeguard your information 
            when you use our mobile application and website (collectively, the &quot;Service&quot;).
          </p>
          <p className="text-slate-300">
            Please read this Privacy Policy carefully. By using StancePro, you agree to the collection 
            and use of information in accordance with this policy.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">2. Information We Collect</h2>
          
          <h3 className="text-xl font-medium mb-3 text-brand-400">Personal Information</h3>
          <p className="text-slate-300 mb-4">When you create an account, we may collect:</p>
          <ul className="list-disc pl-6 text-slate-300 mb-4 space-y-2">
            <li>Email address</li>
            <li>Display name</li>
            <li>Profile picture (optional)</li>
            <li>Physical measurements (height, weight, leg length) for stance calculations</li>
          </ul>

          <h3 className="text-xl font-medium mb-3 text-brand-400">Usage Data</h3>
          <p className="text-slate-300 mb-4">We automatically collect:</p>
          <ul className="list-disc pl-6 text-slate-300 mb-4 space-y-2">
            <li>Device information (type, operating system)</li>
            <li>App usage patterns and feature interactions</li>
            <li>Crash reports and performance data</li>
          </ul>

          <h3 className="text-xl font-medium mb-3 text-brand-400">User-Generated Content</h3>
          <p className="text-slate-300">
            Videos, posts, reviews, and other content you create and share through the Service.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">3. How We Use Your Information</h2>
          <p className="text-slate-300 mb-4">We use the information we collect to:</p>
          <ul className="list-disc pl-6 text-slate-300 space-y-2">
            <li>Provide and maintain the Service</li>
            <li>Calculate personalized stance recommendations</li>
            <li>Enable video coaching features</li>
            <li>Facilitate community features (Field Talks, Reviews)</li>
            <li>Send notifications about your coaching sessions</li>
            <li>Improve and optimize the Service</li>
            <li>Respond to customer support requests</li>
            <li>Comply with legal obligations</li>
          </ul>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">4. Data Sharing and Disclosure</h2>
          <p className="text-slate-300 mb-4">We may share your information with:</p>
          <ul className="list-disc pl-6 text-slate-300 space-y-2">
            <li><strong>Coaches:</strong> If you use video coaching, your videos and profile information are shared with assigned coaches</li>
            <li><strong>Community:</strong> Content you post publicly (Field Talks, Reviews) is visible to other users</li>
            <li><strong>Service Providers:</strong> Third-party services that help us operate (cloud hosting, analytics)</li>
            <li><strong>Legal Requirements:</strong> When required by law or to protect our rights</li>
          </ul>
          <p className="text-slate-300 mt-4">
            We do not sell your personal information to third parties.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">5. Data Storage and Security</h2>
          <p className="text-slate-300 mb-4">
            Your data is stored securely using industry-standard encryption and security practices. 
            We use Supabase for our backend infrastructure, which provides enterprise-grade security.
          </p>
          <p className="text-slate-300">
            Videos and images are stored in secure cloud storage with access controls. 
            We retain your data for as long as your account is active or as needed to provide services.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">6. Your Rights and Choices</h2>
          <p className="text-slate-300 mb-4">You have the right to:</p>
          <ul className="list-disc pl-6 text-slate-300 space-y-2">
            <li>Access and download your personal data</li>
            <li>Update or correct your information</li>
            <li>Delete your account and associated data</li>
            <li>Opt out of marketing communications</li>
            <li>Disable notifications</li>
          </ul>
          <p className="text-slate-300 mt-4">
            To exercise these rights, contact us at <a href="mailto:privacy@stance-pro.com" className="text-brand-400 hover:underline">privacy@stance-pro.com</a>.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">7. Children&apos;s Privacy</h2>
          <p className="text-slate-300">
            StancePro is not intended for children under 13. We do not knowingly collect personal 
            information from children under 13. If you believe we have collected such information, 
            please contact us immediately.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">8. Changes to This Policy</h2>
          <p className="text-slate-300">
            We may update this Privacy Policy from time to time. We will notify you of any changes 
            by posting the new Privacy Policy on this page and updating the &quot;Last updated&quot; date.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">9. Contact Us</h2>
          <p className="text-slate-300">
            If you have questions about this Privacy Policy, please contact us at:
          </p>
          <p className="text-slate-300 mt-4">
            Email: <a href="mailto:privacy@stance-pro.com" className="text-brand-400 hover:underline">privacy@stance-pro.com</a>
          </p>
        </section>
      </div>
    </div>
  );
}

