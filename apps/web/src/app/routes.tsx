import { createBrowserRouter } from "react-router";
import AuthPage from "./pages/AuthPage";
import SimpleAuth from "./pages/SimpleAuth";
import ReaderPortal from "./pages/ReaderPortal";
import PublisherPortal from "./pages/PublisherPortal";
import ReviewerPortal from "./pages/ReviewerPortal";
import ArticleEditHistory from "./pages/ArticleEditHistory";
import UserPortal from "./pages/UserPortal";
import VerificationResult from "./pages/VerificationResult";
import SavedArticles from "./pages/SavedArticles";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: AuthPage,
  },
  {
    path: "/simple-login",
    Component: SimpleAuth,
  },
  {
    path: "/reader-portal",
    Component: ReaderPortal,
  },
  {
    path: "/user-portal",
    Component: UserPortal,
  },
  {
    // Kept param-less for the existing mock entry points (VerificationHero's
    // search/scan tabs, RecentlyVerified, SavedArticles) — none of them have a
    // real article id to navigate with, since there's no backend search
    // endpoint yet (only exact-id lookup). VerificationResult renders the
    // static mock when no id is present, and real fetched data when one is.
    path: "/verification-result",
    Component: VerificationResult,
  },
  {
    path: "/verification-result/:articleId",
    Component: VerificationResult,
  },
  {
    path: "/saved-articles",
    Component: SavedArticles,
  },
  {
    path: "/publisher-portal",
    Component: PublisherPortal,
  },
  {
    path: "/reviewer-portal",
    Component: ReviewerPortal,
  },
  {
    path: "/article-edit-history",
    Component: ArticleEditHistory,
  },
]);