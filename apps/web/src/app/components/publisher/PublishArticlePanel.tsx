import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { FileText, X } from "lucide-react";
import MediaEvidenceUpload from "./MediaEvidenceUpload";
import { toast } from "sonner";
import { useApiClient } from "../../lib/apiClient";
import type { components } from "@sourceit/shared/client";

type ArticleCategory = components["schemas"]["Article"]["category"];

interface PublishArticlePanelProps {
  showForm?: boolean;
  publisherId?: string;
  onStartClick?: () => void;
  onCancel?: () => void;
  onPublished?: () => void;
}

export default function PublishArticlePanel({
  showForm = false,
  publisherId,
  onStartClick,
  onCancel,
  onPublished,
}: PublishArticlePanelProps) {
  const api = useApiClient();
  const [headline, setHeadline] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<ArticleCategory | "">("");
  const [authorName, setAuthorName] = useState("");
  const [tags, setTags] = useState("");
  const [sourceLinks, setSourceLinks] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  async function createArticle(submit: boolean) {
    if (!publisherId) {
      toast.error("No publisher account to publish under");
      return;
    }
    if (!headline || !summary || !content || !category || !authorName) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);
    const { data, error } = await api.POST("/articles", {
      body: {
        publisherId,
        category,
        headline,
        summary,
        content,
        authorName,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        sourceLinks: sourceLinks
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        submit,
      },
    });
    setIsSubmitting(false);

    if (error || !data) {
      toast.error("Something went wrong publishing this article");
      return;
    }

    toast.success(
      submit ? "Article submitted! Hash recorded." : "Draft saved.",
    );
    if (onPublished) onPublished();
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void createArticle(true);
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
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="summary">Summary</Label>
              <Textarea
                id="summary"
                placeholder="Brief summary of the article"
                rows={3}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">Full Article Content</Label>
              <Textarea
                id="content"
                placeholder="Write your full article content here..."
                rows={8}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select
                  required
                  value={category}
                  onValueChange={(value) => setCategory(value as ArticleCategory)}
                >
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
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                placeholder="e.g., election, 2026, politics (comma-separated)"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sourceLinks">Source Links</Label>
              <Textarea
                id="sourceLinks"
                placeholder="Add reference URLs (one per line)"
                rows={3}
                value={sourceLinks}
                onChange={(e) => setSourceLinks(e.target.value)}
              />
            </div>
          </div>

          {/* Media & Evidence Upload */}
          <MediaEvidenceUpload />

          {/* Submit Buttons */}
          <div className="flex items-center gap-3 pt-4 border-t border-slate-200">
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={isSubmitting}>
              Submit Article
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="button" variant="ghost" disabled={isSubmitting} onClick={() => void createArticle(false)}>
              Save as Draft
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
