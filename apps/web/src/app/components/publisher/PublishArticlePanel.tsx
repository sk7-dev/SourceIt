import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { FileText, X } from "lucide-react";
import MediaEvidenceUpload from "./MediaEvidenceUpload";
import { toast } from "sonner";

interface PublishArticlePanelProps {
  showForm?: boolean;
  onStartClick?: () => void;
  onCancel?: () => void;
}

export default function PublishArticlePanel({ showForm = false, onStartClick, onCancel }: PublishArticlePanelProps) {
  if (!showForm) {
    return (
      <Card className="border-blue-200 bg-blue-50/30">
        <CardHeader>
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex-1">
              <CardTitle>Publish New Article</CardTitle>
              <CardDescription className="mt-1">
                Articles will be hashed, stored, and tracked with complete version history on the blockchain.
                All submissions are logged for transparency and credibility verification.
              </CardDescription>
              <Button onClick={onStartClick} className="mt-4 bg-blue-600 hover:bg-blue-700">
                Start New Submission
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Article submitted successfully! Hash recorded on-chain.");
    if (onCancel) onCancel();
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Publish New Article</CardTitle>
            <CardDescription>Submit your article with supporting evidence and media</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onCancel}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Article Details */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="headline">Headline</Label>
              <Input
                id="headline"
                placeholder="Enter article headline"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="summary">Summary</Label>
              <Textarea
                id="summary"
                placeholder="Brief summary of the article"
                rows={3}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">Full Article Content</Label>
              <Textarea
                id="content"
                placeholder="Write your full article content here..."
                rows={8}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select required>
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="politics">Politics</SelectItem>
                    <SelectItem value="technology">Technology</SelectItem>
                    <SelectItem value="health">Health</SelectItem>
                    <SelectItem value="science">Science</SelectItem>
                    <SelectItem value="business">Business</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="author">Author Name</Label>
                <Input
                  id="author"
                  placeholder="Enter author name"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                placeholder="e.g., election, 2026, politics (comma-separated)"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sourceLinks">Source Links</Label>
              <Textarea
                id="sourceLinks"
                placeholder="Add reference URLs (one per line)"
                rows={3}
              />
            </div>
          </div>

          {/* Media & Evidence Upload */}
          <MediaEvidenceUpload />

          {/* Submit Buttons */}
          <div className="flex items-center gap-3 pt-4 border-t border-slate-200">
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
              Submit Article
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="button" variant="ghost">
              Save as Draft
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
