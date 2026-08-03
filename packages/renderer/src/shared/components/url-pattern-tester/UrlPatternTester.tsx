import { Button } from "@/shared/components/button/Button";
import { Input } from "@/shared/components/input/Input";
import { Typography } from "@/shared/components/typography/Typography";
import { matchesUrlPattern } from "@shared/url-matching";
import { AlertCircle, CheckCircle2, Globe, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { IconButton } from "../icon-button/IconButton";

type UrlPatternTesterProps = {
  patterns: string[];
  onClose: () => void;
};

type TestResult = {
  url: string;
  matches: boolean;
  matchedPattern?: string;
};

export function UrlPatternTester({ patterns, onClose }: UrlPatternTesterProps) {
  const [testUrl, setTestUrl] = useState("");
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [openTabUrls, setOpenTabUrls] = useState<string[]>([]);
  const [tabsError, setTabsError] = useState<string | null>(null);

  useEffect(() => {
    if (!testUrl) {
      setTestResults([]);
      return;
    }

    const matches = matchesUrlPattern(testUrl, patterns);
    const matchedPattern = patterns.find((pattern) =>
      matchesUrlPattern(testUrl, [pattern])
    );

    setTestResults([
      {
        url: testUrl,
        matches,
        matchedPattern,
      },
    ]);
  }, [testUrl, patterns]);

  const handleTestOpenTabs = async () => {
    try {
      setTabsError(null);
      const tabs = await chrome.tabs.query({});
      const urls = tabs.map((tab) => tab.url).filter(Boolean) as string[];
      setOpenTabUrls(urls);

      const results: TestResult[] = urls.map((url) => {
        const matches = matchesUrlPattern(url, patterns);
        const matchedPattern = patterns.find((pattern) =>
          matchesUrlPattern(url, [pattern])
        );
        return { url, matches, matchedPattern };
      });

      setTestResults(results);
    } catch (error) {
      console.error("Failed to query tabs:", error);
      setTabsError("Could not read open tabs.");
      setTestResults([]);
    }
  };

  return (
    <div className="backdrop-blur-sm fixed inset-0 z-1000 flex animate-fade-in items-center justify-center bg-[rgba(0,0,0,0.6)]">
      <div className="max-w-3xl shadow-2xl flex max-h-[90vh] w-full flex-col gap-md overflow-hidden rounded-default border border-border bg-surface-raised p-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-sm">
            <Globe className="h-5 w-5 text-accent" />
            <Typography variant="title">URL Pattern Tester</Typography>
          </div>
          <IconButton icon={XIcon} onClick={onClose} />
        </div>
        <div className="flex flex-col gap-xs">
          <Typography
            variant="caption"
            className="font-mono text-text-muted uppercase"
          >
            Test URL
          </Typography>
          <Input
            value={testUrl}
            onChange={(e) => setTestUrl(e.target.value)}
            placeholder="https://example.com/page"
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-xs">
          <div className="flex gap-sm">
            <Button variant="secondary" onClick={handleTestOpenTabs}>
              <Globe className="h-4 w-4" />
              Test Open Tabs
              {openTabUrls.length > 0 ? ` (${openTabUrls.length})` : ""}
            </Button>
          </div>
          {tabsError && (
            <Typography variant="caption" className="text-error-accent">
              {tabsError}
            </Typography>
          )}
        </div>
        <div className="flex flex-col gap-xs">
          <Typography
            variant="caption"
            className="font-mono text-text-muted uppercase"
          >
            Current Patterns ({patterns.length})
          </Typography>
          <div className="flex flex-col gap-2xs rounded-default border border-border bg-surface-base p-sm">
            {patterns.length === 0 ? (
              <Typography variant="body" className="text-text-muted">
                No patterns defined
              </Typography>
            ) : (
              patterns.map((pattern, index) => (
                <div
                  key={index}
                  className="rounded-[3px] bg-surface-raised px-sm py-xs font-mono text-sm text-text-muted-strong"
                >
                  {pattern}
                </div>
              ))
            )}
          </div>
        </div>
        {testResults.length > 0 && (
          <div className="flex min-h-0 flex-1 flex-col gap-xs overflow-hidden">
            <Typography
              variant="caption"
              className="font-mono text-text-muted uppercase"
            >
              Test Results ({testResults.filter((r) => r.matches).length}{" "}
              matches)
            </Typography>
            <div className="scrollbar-thin-6 min-h-0 flex-1 overflow-y-auto rounded-default border border-border bg-surface-base">
              <div className="flex flex-col gap-2xs p-sm">
                {testResults.map((result, index) => (
                  <TestResultItem key={index} result={result} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TestResultItem({ result }: { result: TestResult }) {
  return (
    <div
      className={clsx(
        "flex items-start gap-sm rounded-default border p-sm transition-colors",
        result.matches
          ? "border-accent-border bg-accent-subtle"
          : "border-border bg-surface-raised"
      )}
    >
      <div className="shrink-0 pt-[2px]">
        {result.matches ? (
          <CheckCircle2 className="h-4 w-4 text-accent" />
        ) : (
          <AlertCircle className="h-4 w-4 text-text-muted" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2xs">
        <Typography
          variant="body"
          className={clsx(
            "font-mono text-xs wrap-break-word",
            result.matches ? "text-text-muted-strong" : "text-text-muted"
          )}
        >
          {result.url}
        </Typography>
        {result.matchedPattern && (
          <Typography variant="caption" className="font-mono text-accent">
            Matched: {result.matchedPattern}
          </Typography>
        )}
      </div>
    </div>
  );
}
