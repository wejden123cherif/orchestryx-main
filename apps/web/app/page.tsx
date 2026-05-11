"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  Boxes,
  Zap,
  Shield,
  Server,
  LayoutDashboard,
  GitBranch,
  Settings,
  Activity,
  Users,
  Eye,
  AlertCircle,
  Clock,
  Workflow,
  BookOpen,
  Search,
  CheckCircle,
  Check,
  ChevronDown,
  MonitorPlay,
  CloudCog,
  FastForward,
  Info,
  ShieldCheck,
  Building,
  GraduationCap
} from "lucide-react";
import { OrchestrYXLogo } from "@/components/ui/orchestryx-logo";
import { buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export default function HomePage() {
  const { isAuthenticated } = useAuth();
  const launchHref = isAuthenticated ? "/dashboard" : "/register";

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* 1. Navbar */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5">
              <OrchestrYXLogo className="h-8 w-8" />
              <span className="text-base font-semibold tracking-tight">Orchestryx</span>
            </Link>
            <nav className="hidden md:flex items-center gap-6 text-[13px] font-medium text-muted-foreground">
              <a href="#platform" className="hover:text-foreground transition-colors">Platform</a>
              <a href="#use-cases" className="hover:text-foreground transition-colors">Use Cases</a>
              <a href="#security" className="hover:text-foreground transition-colors">Security</a>
              <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className={cn(buttonVariants.ghost, "inline-flex items-center justify-center font-medium rounded-lg px-3 hidden sm:inline-flex h-9 text-sm transition-colors")}
            >
              Sign In
            </Link>
            <Link
              href={launchHref}
              className={cn(buttonVariants.primary, "inline-flex items-center justify-center font-medium rounded-lg px-4 h-9 text-sm transition-colors")}
            >
              Launch App
            </Link>
          </div>
        </div>
      </header>

      {/* 2. Hero */}
      <section className="relative overflow-hidden pt-24 pb-20 lg:pt-36 lg:pb-28">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/15 via-background to-background" />
        <div className="absolute inset-0 -z-10 builder-grid opacity-20 [mask-image:linear-gradient(to_bottom,white,transparent)]" />
        <div className="mx-auto max-w-7xl px-5 text-center sm:px-6 lg:px-8">
          <motion.h1 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto max-w-4xl text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl"
          >
            Launch Cybersecurity Labs in Minutes
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl"
          >
            Orchestryx gives teams ready-to-use cloud security labs for training, testing, research, and hands-on learning.
          </motion.p>
          <motion.p 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground/80"
          >
            Create realistic cybersecurity environments without manually setting up cloud infrastructure every time.
          </motion.p>
          
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <Link
              href={launchHref}
              className={cn(buttonVariants.primary, "inline-flex items-center justify-center font-medium rounded-xl h-11 gap-2 px-6 w-full sm:w-auto text-base transition-colors")}
            >
              Launch App
            </Link>
            <a
              href="#platform"
              className={cn(buttonVariants.secondary, "inline-flex items-center justify-center font-medium rounded-xl h-11 gap-2 px-6 w-full sm:w-auto text-base transition-colors")}
            >
              Explore Platform
            </a>
          </motion.div>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-8 text-xs font-medium text-muted-foreground/60"
          >
            Built for security teams, training providers, startups, and cloud security learners.
          </motion.p>
        </div>
      </section>

      {/* 3. Problem Section */}
      <section className="bg-muted/30 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Cybersecurity Labs Are Too Hard to Set Up Manually
            </h2>
            <p className="mt-6 text-base leading-relaxed text-muted-foreground">
              Building hands-on security labs usually takes too much time. Teams have to configure infrastructure, prepare environments, manage access, monitor usage, and clean up resources after every session.
            </p>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Orchestryx removes that friction so teams can focus on learning, testing, and improving security skills.
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { title: "Slow Setup", desc: "Manual lab preparation wastes time before training or testing can even begin.", icon: Clock },
              { title: "Inconsistent Environments", desc: "Different setups lead to different results, confusion, and repeated troubleshooting.", icon: AlertCircle },
              { title: "Cloud Cost Waste", desc: "Unused lab resources can keep running longer than needed.", icon: Zap },
              { title: "Limited Visibility", desc: "Teams need a clear view of which labs are active, available, or completed.", icon: Eye },
            ].map((item, i) => (
              <motion.div 
                key={i} 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="app-card flex flex-col p-6"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                  <item.icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Solution Section */}
      <section className="py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              A Simpler Way to Run Cloud Security Labs
            </h2>
            <p className="mt-6 text-base leading-relaxed text-muted-foreground">
              Orchestryx lets users choose a lab, launch it, monitor progress, and access the environment from one clean platform.
            </p>
          </div>

          <div className="mt-16 relative">
            <div className="absolute top-1/2 left-0 right-0 h-0.5 -translate-y-1/2 bg-border hidden md:block" />
            <div className="grid gap-6 md:grid-cols-5 relative z-10">
              {[
                { step: "Choose a Lab", icon: Search },
                { step: "Launch", icon: Zap },
                { step: "Access Environment", icon: LayoutDashboard },
                { step: "Practice", icon: MonitorPlay },
                { step: "Finish", icon: CheckCircle },
              ].map((item, i) => (
                <motion.div 
                  key={i} 
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.4, delay: i * 0.15 }}
                  className="flex flex-col items-center text-center"
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-background bg-primary/10 text-primary shadow-sm">
                    <item.icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-foreground">{item.step}</h3>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="mx-auto mt-16 max-w-2xl text-center">
            <p className="text-sm italic text-muted-foreground/80">
              Behind the scenes, Orchestryx handles the cloud setup and environment management so users do not have to.
            </p>
          </div>
        </div>
      </section>

      {/* 5. Benefits Section */}
      <section className="bg-muted/30 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Everything Your Team Needs to Run Practical Cyber Labs
          </h2>
          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { title: "Ready-to-Use Labs", desc: "Give users practical cybersecurity environments without starting from scratch.", icon: Boxes },
              { title: "Cloud-Based Environments", desc: "Run labs on AWS-backed infrastructure designed for realistic training and experimentation.", icon: CloudCog },
              { title: "Fast Launch Experience", desc: "Start lab sessions quickly through a simple, guided interface.", icon: FastForward },
              { title: "Clear Lab Status", desc: "See whether a lab is starting, active, completed, or needs attention.", icon: Activity },
              { title: "Controlled Usage", desc: "Keep better control over lab access, usage, and cloud resources.", icon: ShieldCheck },
              { title: "Professional Dashboard", desc: "Manage labs, users, sessions, and activity from a clean operational interface.", icon: LayoutDashboard },
            ].map((item, i) => (
              <motion.div 
                key={i} 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="app-card flex gap-4 p-6"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <item.icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{item.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. Platform Preview Section */}
      <section id="platform" className="py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              One Platform for Hands-On Cybersecurity Labs
            </h2>
            <p className="mt-6 text-base leading-relaxed text-muted-foreground">
              Orchestryx brings lab discovery, environment launch, progress tracking, topology views, and administration into one place.
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2">
            {[
              { title: "Lab Catalog", desc: "Browse available labs by category, difficulty, topic, and purpose.", icon: Search },
              { title: "Lab Sessions", desc: "Launch and monitor active lab environments from a single dashboard.", icon: Server },
              { title: "Topology View", desc: "Understand lab components, services, and connections visually.", icon: GitBranch },
              { title: "Admin Console", desc: "Manage users, labs, activity, and platform operations with less manual work.", icon: Settings },
            ].map((item, i) => (
              <motion.div 
                key={i} 
                initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="app-card-interactive group relative overflow-hidden p-8"
              >
                <div className="absolute right-0 top-0 -mt-8 -mr-8 h-32 w-32 rounded-full bg-primary/10 transition-transform duration-500 group-hover:scale-150" />
                <item.icon className="relative z-10 h-8 w-8 text-primary/80" />
                <h3 className="relative z-10 mt-6 text-lg font-semibold text-foreground">{item.title}</h3>
                <p className="relative z-10 mt-2 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Use Cases Section */}
      <section id="use-cases" className="bg-muted/30 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Built for Real Security Training and Experimentation
          </h2>
          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { title: "Security Training", desc: "Deliver hands-on labs for cloud security, web security, network security, and defensive practice.", icon: Shield },
              { title: "Team Onboarding", desc: "Give new team members practical environments to learn tools, workflows, and security concepts.", icon: Users },
              { title: "Cloud Security Practice", desc: "Explore realistic AWS security scenarios in controlled lab environments.", icon: CloudCog },
              { title: "Internal Workshops", desc: "Run repeatable labs for company training, demos, and technical sessions.", icon: Building },
              { title: "Research and Testing", desc: "Use isolated environments to test ideas, reproduce issues, and validate security controls.", icon: Workflow },
              { title: "Training Providers", desc: "Offer structured lab experiences without rebuilding infrastructure for every cohort.", icon: GraduationCap },
            ].map((item, i) => (
              <motion.div 
                key={i} 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="app-card flex flex-col p-6"
              >
                <item.icon className="mb-4 h-6 w-6 text-foreground/80" />
                <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* 8. Trust / Cloud Foundation */}
      <section className="py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Built on a Modern Cloud Foundation
              </h2>
              <p className="mt-6 text-base leading-relaxed text-muted-foreground">
                Orchestryx is designed as a cloud-native platform, not a collection of manual scripts. It uses AWS-backed infrastructure, secure configuration practices, and a structured approach to managing lab environments.
              </p>
            </div>
            <div className="app-card bg-secondary/20 p-8">
              <ul className="space-y-4">
                {[
                  "AWS-backed lab environments",
                  "Secure user access",
                  "Centralized lab management",
                  "Clear environment status",
                  "Managed runtime configuration",
                  "Infrastructure designed for repeatability",
                  "Operational logging and visibility",
                ].map((point, i) => (
                  <motion.li 
                    key={i} 
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.3, delay: i * 0.1 }}
                    className="flex items-start gap-3"
                  >
                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                    <span className="text-sm font-medium text-foreground">{point}</span>
                  </motion.li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 9. Security Section */}
      <section id="security" className="bg-muted/30 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Designed for Safe, Controlled Lab Access
            </h2>
            <p className="mt-6 text-base leading-relaxed text-muted-foreground">
              Cybersecurity labs need clear boundaries, controlled access, and visibility. Orchestryx is built to help teams run hands-on environments with better control and less manual risk.
            </p>
          </div>
          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { title: "Controlled Access", desc: "Users access labs through an authenticated platform experience." },
              { title: "Clear Boundaries", desc: "Lab environments are managed separately from the main platform." },
              { title: "Better Visibility", desc: "Admins can track lab activity, active sessions, and operational status." },
              { title: "Cleaner Cloud Usage", desc: "Teams can reduce unnecessary cloud waste by managing lab sessions from one place." },
            ].map((item, i) => (
              <motion.div 
                key={i} 
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="border-t-2 border-primary/20 pt-4"
              >
                <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* 10. CTA Section */}
      <section className="py-20 lg:py-28">
        <div className="mx-auto max-w-4xl px-5 text-center sm:px-6 lg:px-8">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="app-card relative overflow-hidden bg-primary/5 p-12 lg:p-20"
          >
            <div className="absolute inset-0 -z-10 builder-grid opacity-20" />
            <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent" />
            <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Start Running Cybersecurity Labs the Easier Way
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground">
              Use Orchestryx to launch and manage practical cloud security labs without manual infrastructure setup.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href={launchHref}
                className={cn(buttonVariants.primary, "inline-flex items-center justify-center font-medium rounded-xl h-11 gap-2 px-6 w-full sm:w-auto transition-colors")}
              >
                Launch App
              </Link>
              <Link
                href="/register"
                className={cn(buttonVariants.secondary, "inline-flex items-center justify-center font-medium rounded-xl h-11 gap-2 px-6 w-full sm:w-auto transition-colors")}
              >
                Sign Up
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* 11. FAQ Section */}
      <section id="faq" className="bg-muted/30 py-20 lg:py-28">
        <div className="mx-auto max-w-3xl px-5 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Frequently Asked Questions
          </h2>
          <div className="mt-12 divide-y divide-border">
            {[
              { q: "Who is Orchestryx for?", a: "Orchestryx is for security teams, training providers, startups, research groups, cloud security engineers, and anyone who needs practical cybersecurity lab environments." },
              { q: "What can I do with Orchestryx?", a: "You can browse labs, launch cloud-based environments, monitor active sessions, view lab structure, and manage platform activity from one interface." },
              { q: "Is Orchestryx only for CTFs?", a: "No. Orchestryx can support challenge-style labs, but it is designed for broader cybersecurity training, testing, research, and team enablement." },
              { q: "Does Orchestryx use AWS?", a: "Yes. Orchestryx is designed around AWS-backed cloud environments for realistic security training and experimentation." },
              { q: "Do users need cloud experience?", a: "Not necessarily. Orchestryx is designed to hide the infrastructure complexity and give users a simpler lab experience." },
              { q: "Can teams create their own labs?", a: "Orchestryx is designed around reusable lab templates. Custom lab availability depends on the platform setup and supported lab types." },
            ].map((faq, i) => (
              <FAQItem key={i} question={faq.q} answer={faq.a} />
            ))}
          </div>
        </div>
      </section>

      {/* 12. Footer */}
      <footer className="border-t border-border bg-background py-12 lg:py-16">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
            <div>
              <Link href="/" className="flex items-center gap-2.5">
                <OrchestrYXLogo className="h-8 w-8" />
                <span className="text-base font-semibold tracking-tight text-foreground">Orchestryx</span>
              </Link>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
                Cloud-based cybersecurity labs for training, testing, and hands-on security practice.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Platform</h3>
              <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                <li><Link href="/catalog" className="hover:text-primary transition-colors">Lab Catalog</Link></li>
                <li><Link href="/labs" className="hover:text-primary transition-colors">Lab Sessions</Link></li>
                <li><Link href="/builder" className="hover:text-primary transition-colors">Topology View</Link></li>
                <li><Link href="/admin" className="hover:text-primary transition-colors">Admin Console</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Use Cases</h3>
              <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                <li><a href="#use-cases" className="hover:text-primary transition-colors">Security Training</a></li>
                <li><a href="#use-cases" className="hover:text-primary transition-colors">Cloud Security Practice</a></li>
                <li><a href="#use-cases" className="hover:text-primary transition-colors">Internal Workshops</a></li>
                <li><a href="#use-cases" className="hover:text-primary transition-colors">Research</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Product</h3>
              <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                <li><Link href={launchHref} className="hover:text-primary transition-colors">Launch App</Link></li>
                <li><Link href="/login" className="hover:text-primary transition-colors">Sign In</Link></li>
                <li><Link href="/register" className="hover:text-primary transition-colors">Request Access</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-border pt-8 sm:flex-row">
            <p className="text-xs text-muted-foreground">Orchestryx &copy; 2026</p>
            <p className="text-xs text-muted-foreground sm:text-right">
              Built for practical cybersecurity teams that need faster, cleaner, and more reliable lab environments.
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="py-5">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="text-[15px] font-medium text-foreground">{question}</span>
        <ChevronDown
          className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200", isOpen && "rotate-180")}
        />
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <p className="pt-4 text-sm leading-relaxed text-muted-foreground">{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
