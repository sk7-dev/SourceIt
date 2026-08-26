import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Shield, CheckCircle2 } from "lucide-react";
import LoginForm from "../components/auth/LoginForm";
import RegisterForm from "../components/auth/RegisterForm";
import { motion } from "motion/react";

export default function AuthPage() {
  const [activeTab, setActiveTab] = useState("login");

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4">
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-center">
        {/* Hero Section */}
        <div className="hidden lg:flex flex-col justify-center space-y-6 p-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
              <Shield className="w-4 h-4" />
              Blockchain-Verified Trust
            </div>
            
            <h1 className="text-4xl font-bold text-slate-900 leading-tight">
              SourceIt
            </h1>
            
            <p className="text-lg text-slate-600">
              Verify news authenticity, track publisher credibility, and build trust through transparent records.
            </p>
          </div>

          <div className="space-y-4 pt-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900">Transparent Verification</h3>
                <p className="text-sm text-slate-600">Every article verified on an immutable blockchain ledger</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900">Credibility Tracking</h3>
                <p className="text-sm text-slate-600">Real-time publisher reputation scores based on verification history</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900">Community-Driven</h3>
                <p className="text-sm text-slate-600">Independent reviewers ensure accuracy and objectivity</p>
              </div>
            </div>
          </div>
        </div>

        {/* Auth Card - Animated */}
        <motion.div 
          className="w-full max-w-md mx-auto lg:mx-0"
          initial={{ opacity: 0, x: 50, scale: 0.95 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ 
            duration: 0.6,
            ease: [0.22, 1, 0.36, 1]
          }}
        >
          <Card className="shadow-xl border-slate-200 flex flex-col">
            {/* Mobile Logo */}
            <div className="lg:hidden text-center pt-6 pb-2">
              <h1 className="text-3xl font-bold text-slate-900 mb-2">SourceIT</h1>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                <Shield className="w-3 h-3" />
                Blockchain-Verified Trust
              </div>
            </div>
            
            <CardHeader className="space-y-1 flex-shrink-0">
              <CardTitle className="text-xl sm:text-2xl text-center">Welcome</CardTitle>
              <CardDescription className="text-center text-sm">
                Join the future of trusted news verification
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col">
                <TabsList className="grid w-full grid-cols-2 mb-6 flex-shrink-0">
                  <TabsTrigger value="login">Login</TabsTrigger>
                  <TabsTrigger value="register">Register</TabsTrigger>
                </TabsList>
                
                <div className="flex-1 overflow-y-auto pr-1 scrollbar-hide max-h-[500px] sm:max-h-[600px]">
                  <TabsContent value="login" className="space-y-4 mt-0">
                    <LoginForm />
                  </TabsContent>
                  
                  <TabsContent value="register" className="space-y-4 mt-0">
                    <RegisterForm />
                  </TabsContent>
                </div>
              </Tabs>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}