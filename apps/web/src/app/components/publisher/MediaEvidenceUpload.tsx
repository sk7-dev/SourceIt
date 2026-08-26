import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Upload, File, Image as ImageIcon, Video, FileText, X } from "lucide-react";
import { Alert, AlertDescription } from "../ui/alert";
import { Shield } from "lucide-react";

interface UploadedFile {
  id: string;
  name: string;
  type: "image" | "video" | "document";
  tag: "media" | "evidence" | "source";
  caption?: string;
}

export default function MediaEvidenceUpload() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  const handleFileSelect = (tag: "media" | "evidence" | "source") => {
    // Simulated file upload
    const newFile: UploadedFile = {
      id: Date.now().toString(),
      name: `${tag}-file-${uploadedFiles.length + 1}.jpg`,
      type: "image",
      tag,
    };
    setUploadedFiles([...uploadedFiles, newFile]);
  };

  const removeFile = (id: string) => {
    setUploadedFiles(uploadedFiles.filter(f => f.id !== id));
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case "image": return ImageIcon;
      case "video": return Video;
      case "document": return FileText;
      default: return File;
    }
  };

  const getTagColor = (tag: string) => {
    switch (tag) {
      case "media": return "bg-blue-100 text-blue-700 border-blue-200";
      case "evidence": return "bg-green-100 text-green-700 border-green-200";
      case "source": return "bg-purple-100 text-purple-700 border-purple-200";
      default: return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  return (
    <Card className="border-2 border-blue-200 bg-blue-50/20">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Shield className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <CardTitle>Media & Evidence</CardTitle>
            <CardDescription>
              Upload supporting media, evidence documents, and source files. Each asset can be linked to the article record and integrity-checked.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload Areas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Cover Image */}
          <div className="space-y-2">
            <Label>Cover Image</Label>
            <div
              className="border-2 border-dashed border-slate-300 rounded-lg p-6 hover:border-blue-400 hover:bg-blue-50/50 transition-colors cursor-pointer"
              onClick={() => handleFileSelect("media")}
            >
              <div className="flex flex-col items-center gap-2 text-center">
                <ImageIcon className="w-8 h-8 text-slate-400" />
                <p className="text-xs text-slate-600">Click to upload</p>
                <p className="text-xs text-slate-400">JPG, PNG, WEBP</p>
              </div>
            </div>
          </div>

          {/* Media Gallery */}
          <div className="space-y-2">
            <Label>Media Gallery</Label>
            <div
              className="border-2 border-dashed border-slate-300 rounded-lg p-6 hover:border-blue-400 hover:bg-blue-50/50 transition-colors cursor-pointer"
              onClick={() => handleFileSelect("media")}
            >
              <div className="flex flex-col items-center gap-2 text-center">
                <Video className="w-8 h-8 text-slate-400" />
                <p className="text-xs text-slate-600">Click to upload</p>
                <p className="text-xs text-slate-400">MP4, MOV, JPG</p>
              </div>
            </div>
          </div>

          {/* Evidence Documents */}
          <div className="space-y-2">
            <Label>Evidence Documents</Label>
            <div
              className="border-2 border-dashed border-slate-300 rounded-lg p-6 hover:border-green-400 hover:bg-green-50/50 transition-colors cursor-pointer"
              onClick={() => handleFileSelect("evidence")}
            >
              <div className="flex flex-col items-center gap-2 text-center">
                <FileText className="w-8 h-8 text-slate-400" />
                <p className="text-xs text-slate-600">Click to upload</p>
                <p className="text-xs text-slate-400">PDF, screenshots</p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Drag & Drop Area */}
        <div
          className="border-2 border-dashed border-blue-300 rounded-lg p-8 bg-white hover:border-blue-500 hover:bg-blue-50/30 transition-colors cursor-pointer"
          onClick={() => handleFileSelect("source")}
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="p-4 bg-blue-100 rounded-full">
              <Upload className="w-8 h-8 text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-slate-900">Drop files here or click to upload</p>
              <p className="text-sm text-slate-500 mt-1">
                Support for images, videos, PDFs, and documents
              </p>
            </div>
          </div>
        </div>

        {/* Uploaded Files List */}
        {uploadedFiles.length > 0 && (
          <div className="space-y-2">
            <Label>Uploaded Files ({uploadedFiles.length})</Label>
            <div className="space-y-2">
              {uploadedFiles.map((file) => {
                const FileIcon = getFileIcon(file.type);
                return (
                  <div
                    key={file.id}
                    className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg"
                  >
                    <div className="p-2 bg-slate-100 rounded">
                      <FileIcon className="w-4 h-4 text-slate-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{file.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className={`text-xs ${getTagColor(file.tag)}`}>
                          {file.tag}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Add caption..."
                        className="w-40 h-8 text-xs"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-red-600"
                        onClick={() => removeFile(file.id)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Info Alert */}
        <Alert className="bg-blue-50 border-blue-200">
          <Shield className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-sm text-blue-800">
            All uploaded files are hashed and timestamped for integrity verification. Tag files appropriately for transparency.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
