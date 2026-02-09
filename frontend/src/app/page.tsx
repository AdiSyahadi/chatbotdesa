import Link from "next/link";
import { Button } from "@/components/ui/button";
import { 
  MessageSquare, 
  Webhook, 
  Users, 
  Shield, 
  BarChart, 
  Code,
  ArrowRight,
  Check
} from "lucide-react";

const features = [
  {
    icon: MessageSquare,
    title: "Kirim Pesan Massal",
    description: "Broadcast ke ribuan kontak dengan mudah dan aman",
  },
  {
    icon: Webhook,
    title: "Webhook & API",
    description: "Integrasikan dengan n8n, Zapier, atau sistem Anda",
  },
  {
    icon: Users,
    title: "Multi-User",
    description: "Kelola tim dengan role & permission yang fleksibel",
  },
  {
    icon: Shield,
    title: "Anti-Ban Protection",
    description: "Rate limiting & smart delays built-in",
  },
  {
    icon: BarChart,
    title: "Analytics",
    description: "Track delivery, read receipts, & engagement",
  },
  {
    icon: Code,
    title: "Developer Friendly",
    description: "REST API dengan dokumentasi lengkap",
  },
];

const plans = [
  {
    name: "Starter",
    price: "Rp 99.000",
    period: "/bulan",
    features: [
      "1 WhatsApp Instance",
      "1.000 kontak",
      "5.000 pesan/bulan",
      "Webhook basic",
      "Email support",
    ],
    popular: false,
  },
  {
    name: "Business",
    price: "Rp 299.000",
    period: "/bulan",
    features: [
      "5 WhatsApp Instance",
      "10.000 kontak",
      "50.000 pesan/bulan",
      "Webhook unlimited",
      "API Access",
      "Priority support",
    ],
    popular: true,
  },
  {
    name: "Enterprise",
    price: "Rp 799.000",
    period: "/bulan",
    features: [
      "Unlimited Instance",
      "Unlimited kontak",
      "Unlimited pesan",
      "Dedicated support",
      "Custom integration",
      "SLA 99.9%",
    ],
    popular: false,
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold">WhatsApp SaaS</span>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground">
              Fitur
            </a>
            <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground">
              Harga
            </a>
            <a href="#faq" className="text-sm text-muted-foreground hover:text-foreground">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost">Masuk</Button>
            </Link>
            <Link href="/register">
              <Button>Daftar Gratis</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 md:py-32">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            WhatsApp API untuk{" "}
            <span className="text-primary">Bisnis Anda</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
            Kirim pesan WhatsApp secara otomatis, integrasikan dengan sistem Anda, 
            dan tingkatkan engagement pelanggan dengan mudah.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register">
              <Button size="lg" className="text-lg px-8">
                Mulai Gratis 7 Hari
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="text-lg px-8">
                Lihat Demo
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-muted/50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Semua yang Anda Butuhkan
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Fitur lengkap untuk mengelola komunikasi WhatsApp bisnis Anda
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div 
                key={index} 
                className="bg-background rounded-lg p-6 shadow-sm border"
              >
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Pilih Paket yang Sesuai
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Harga transparan tanpa biaya tersembunyi
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {plans.map((plan, index) => (
              <div 
                key={index} 
                className={`bg-background rounded-lg p-6 border ${
                  plan.popular ? "border-primary shadow-lg relative" : ""
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-primary text-primary-foreground text-sm px-3 py-1 rounded-full">
                      Populer
                    </span>
                  </div>
                )}
                <div className="text-center mb-6">
                  <h3 className="text-xl font-semibold mb-2">{plan.name}</h3>
                  <div className="flex items-baseline justify-center">
                    <span className="text-3xl font-bold">{plan.price}</span>
                    <span className="text-muted-foreground">{plan.period}</span>
                  </div>
                </div>
                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-center gap-2">
                      <Check className="h-5 w-5 text-primary flex-shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/register" className="block">
                  <Button 
                    className="w-full" 
                    variant={plan.popular ? "default" : "outline"}
                  >
                    Pilih {plan.name}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Siap Meningkatkan Bisnis Anda?
          </h2>
          <p className="text-xl opacity-90 mb-8 max-w-2xl mx-auto">
            Mulai gratis selama 7 hari. Tidak perlu kartu kredit.
          </p>
          <Link href="/register">
            <Button size="lg" variant="secondary" className="text-lg px-8">
              Daftar Sekarang
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              <span className="font-semibold">WhatsApp SaaS</span>
            </div>
            <nav className="flex gap-6">
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground">
                About
              </a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground">
                Documentation
              </a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground">
                Terms
              </a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground">
                Privacy
              </a>
            </nav>
            <p className="text-sm text-muted-foreground">
              © 2025 WhatsApp SaaS. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
