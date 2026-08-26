import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Search, Link, ScanLine, Shield, Camera } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

export default function VerificationHero() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState("");
  const [urlInput, setUrlInput] = useState("");

  const handleVerify = () => {
    toast.success("Verifying article...");
    setTimeout(() => {
      navigate("/verification-result");
    }, 1000);
  };

  const handleScan = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment" } 
      });
      
      // Create a video element and display the camera stream
      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();
      
      toast.success("Camera opened! Scanning article...");
      
      // Simulate scanning process
      setTimeout(() => {
        stream.getTracks().forEach(track => track.stop());
        navigate("/verification-result");
      }, 2000);
      
    } catch (error) {
      toast.error("Unable to access camera. Please check permissions.");
      console.error("Camera access error:", error);
    }
  };

  return (
    <Card className="border-2 border-blue-100 shadow-lg">
      <CardHeader className="pb-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <Shield className="w-6 h-6 text-blue-600" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-xl sm:text-2xl mb-1">Verify Article</CardTitle>
            <p className="text-xs sm:text-sm text-slate-600">
              Check whether an article is authentic, updated, disputed, or missing from the registry
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="search" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="search" className="gap-2 text-xs sm:text-sm">
              <Search className="w-4 h-4" />
              <span className="hidden sm:inline">Search Text</span>
              <span className="sm:hidden">Search</span>
            </TabsTrigger>
            <TabsTrigger value="url" className="gap-2 text-xs sm:text-sm">
              <Link className="w-4 h-4" />
              <span className="hidden sm:inline">Paste URL</span>
              <span className="sm:hidden">URL</span>
            </TabsTrigger>
            <TabsTrigger value="scan" className="gap-2 text-xs sm:text-sm">
              <ScanLine className="w-4 h-4" />
              <span>Scan</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="space-y-4 mt-0">
            <div>
              <Input
                placeholder="Search for article by text..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="h-11 sm:h-12 text-sm sm:text-base"
              />
            </div>
            <Button onClick={handleVerify} size="lg" className="w-full bg-blue-600 hover:bg-blue-700 h-11 sm:h-12">
              <Search className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
              Verify Now
            </Button>
          </TabsContent>

          <TabsContent value="url" className="space-y-4 mt-0">
            <div>
              <Input
                placeholder="Paste article URL here..."
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="h-11 sm:h-12 text-sm sm:text-base"
              />
            </div>
            <Button onClick={handleVerify} size="lg" className="w-full bg-blue-600 hover:bg-blue-700 h-11 sm:h-12">
              <Search className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
              Verify Now
            </Button>
          </TabsContent>

          <TabsContent value="scan" className="space-y-4 mt-0">
            <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-lg p-8 sm:p-12 text-center">
              <Camera className="w-12 h-12 sm:w-16 sm:h-16 text-slate-400 mx-auto mb-4" />
              <h3 className="font-semibold text-slate-900 mb-2 text-sm sm:text-base">Scan Article with Camera</h3>
              <p className="text-xs sm:text-sm text-slate-600">
                Use your device camera to scan and verify an article
              </p>
            </div>
            <Button onClick={handleScan} size="lg" className="w-full bg-blue-600 hover:bg-blue-700 h-11 sm:h-12">
              <ScanLine className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
              Open Camera & Scan
            </Button>
          </TabsContent>
        </Tabs>

        <p className="text-xs text-slate-500 text-center mt-6">
          Every registered version is preserved with transparent change history
        </p>
      </CardContent>
    </Card>
  );
}