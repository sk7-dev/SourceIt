import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  Eye,
  Edit,
  History,
  FileCheck,
  MoreVertical,
  FolderOpen,
  Archive,
  ChevronRight
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "../ui/dropdown-menu";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import { useApiClient } from "../../lib/apiClient";
import type { components } from "@sourceit/shared/client";

type ArticleVersionSummary = components["schemas"]["ArticleVersionSummary"];

const reviewStatusLabel: Record<string, string> = {
  draft: "Draft",
  pending_review: "Pending Review",
  verified: "Verified",
};

const anchorStatusLabel: Record<string, string> = {
  pending: "Hash Recorded",
  anchored: "On-chain Logged",
  anchor_failed: "Anchor Failed",
};

function toRow(item: ArticleVersionSummary) {
  return {
    articleId: item.articleId,
    title: item.headline || "(untitled draft)",
    category: item.category.charAt(0).toUpperCase() + item.category.slice(1),
    date: item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : "Not published",
    version: item.versionLabel,
    status: reviewStatusLabel[item.reviewStatus] ?? item.reviewStatus,
    blockchain: item.anchorStatus ? anchorStatusLabel[item.anchorStatus] ?? item.anchorStatus : "Not Published",
  };
}

const getStatusColor = (status: string) => {
  switch (status) {
    case "Verified":
      return "bg-green-100 text-green-700 border-green-200";
    case "Pending Review":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "Disputed":
      return "bg-red-100 text-red-700 border-red-200";
    case "Updated":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "Draft":
      return "bg-slate-100 text-slate-700 border-slate-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
};

const getBlockchainColor = (status: string) => {
  if (status === "On-chain Logged") {
    return "bg-purple-100 text-purple-700 border-purple-200";
  } else if (status === "Hash Recorded") {
    return "bg-blue-100 text-blue-700 border-blue-200";
  }
  return "bg-slate-100 text-slate-500 border-slate-200";
};

interface MyArticlesTableProps {
  publisherId: string | null;
}

export default function MyArticlesTable({ publisherId }: MyArticlesTableProps) {
  const navigate = useNavigate();
  const api = useApiClient();
  const [rows, setRows] = useState<ReturnType<typeof toRow>[] | null>(null);

  useEffect(() => {
    if (!publisherId) return;
    api.GET("/publishers/{publisherId}/articles", { params: { path: { publisherId } } }).then(({ data }) => {
      if (data) setRows(data.items.map(toRow));
    });
  }, [api, publisherId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>My Articles</CardTitle>
      </CardHeader>
      <CardContent>
        {!publisherId ? (
          <p className="text-sm text-slate-500 py-6 text-center">No publisher account to show articles for.</p>
        ) : rows === null ? (
          <p className="text-sm text-slate-500 py-6 text-center">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">No articles yet — publish your first one above.</p>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Title</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Category</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Date Published</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Version</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Review Status</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Blockchain Proof</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((article) => (
                <tr key={article.articleId} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-4 px-4">
                    <p className="font-medium text-slate-900 text-sm">{article.title}</p>
                  </td>
                  <td className="py-4 px-4">
                    <span className="text-sm text-slate-600">{article.category}</span>
                  </td>
                  <td className="py-4 px-4">
                    <span className="text-sm text-slate-600">{article.date}</span>
                  </td>
                  <td className="py-4 px-4">
                    <Badge variant="outline" className="text-xs font-mono">
                      {article.version}
                    </Badge>
                  </td>
                  <td className="py-4 px-4">
                    <Badge variant="outline" className={`text-xs ${getStatusColor(article.status)}`}>
                      {article.status}
                    </Badge>
                  </td>
                  <td className="py-4 px-4">
                    <Badge variant="outline" className={`text-xs ${getBlockchainColor(article.blockchain)}`}>
                      {article.blockchain}
                    </Badge>
                  </td>
                  <td className="py-4 px-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button 
                          className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-64">
                        <DropdownMenuLabel className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          Article Actions
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        
                        <DropdownMenuItem onClick={() => navigate(`/verification-result/${article.articleId}`)}>
                          <Eye className="w-4 h-4" />
                          <span>View Article</span>
                        </DropdownMenuItem>

                        <DropdownMenuItem onClick={() => toast.info("Opening editor...")}>
                          <Edit className="w-4 h-4" />
                          <span>Edit Article</span>
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />

                        <DropdownMenuItem onClick={() => navigate("/article-edit-history")}>
                          <History className="w-4 h-4 text-blue-600" />
                          <span>Version History</span>
                        </DropdownMenuItem>

                        <DropdownMenuItem onClick={() => toast.info("Fetching blockchain proof...")}>
                          <FileCheck className="w-4 h-4 text-purple-600" />
                          <span>View Blockchain Proof</span>
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />

                        <DropdownMenuItem onClick={() => toast.info("Opening media manager...")}>
                          <FolderOpen className="w-4 h-4" />
                          <span>Manage Media & Evidence</span>
                        </DropdownMenuItem>

                        <DropdownMenuItem
                          onClick={async () => {
                            const { error } = await api.POST("/articles/{articleId}/archive", {
                              params: { path: { articleId: article.articleId } },
                            });
                            if (error) {
                              toast.error("Could not archive this article");
                              return;
                            }
                            toast.success("Article archived");
                            setRows((prev) => prev?.filter((r) => r.articleId !== article.articleId) ?? null);
                          }}
                        >
                          <Archive className="w-4 h-4" />
                          <span>Archive Article</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </CardContent>
    </Card>
  );
}