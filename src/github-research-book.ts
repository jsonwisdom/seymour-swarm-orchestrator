/** Read-only GitHub PR discovery. No GitHub writes, deployment or state promotion. */
export type PRState = "OPEN_DRAFT" | "OPEN" | "MERGED" | "CLOSED_UNMERGED";
export interface ResearchChapter {
  id: string; repository: string; number: number; title: string;
  state: PRState; createdAt: string; updatedAt: string;
  headSha: string | null; url: string;
}
export interface ResearchBook {
  schema: "SEYMOUR_GITHUB_RESEARCH_BOOK_V1";
  repository: string;
  chapters: ResearchChapter[];
  counts: Record<PRState, number>;
  sourcePages: number;
  truncated: boolean;
}
type GithubPR = {
  number: number; title: string; state: "open" | "closed"; draft: boolean;
  merged_at: string | null; created_at: string; updated_at: string;
  head?: {sha?: string}; html_url: string;
};
type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
const MAX_PAGES = 20;
const PER_PAGE = 100;
function classify(p: GithubPR): PRState {
  if (p.state === "open") return p.draft ? "OPEN_DRAFT" : "OPEN";
  return p.merged_at ? "MERGED" : "CLOSED_UNMERGED";
}
export async function discoverGithubResearchBook(
  repository: string, fetcher: Fetcher, token?: string, maxPages = MAX_PAGES
): Promise<ResearchBook> {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))
    throw Error("INVALID_REPOSITORY");
  if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > MAX_PAGES)
    throw Error("INVALID_PAGE_LIMIT");
  const chapters: ResearchChapter[] = [];
  let pages = 0, truncated = false;
  for (const state of ["open", "closed"] as const) {
    let exhausted = false;
    for (let page = 1; page <= maxPages; page++) {
      const url = `https://api.github.com/repos/${repository}/pulls?state=${state}&per_page=${PER_PAGE}&page=${page}`;
      const response = await fetcher(url, {
        method: "GET",
        headers: {
          Accept: "application/vnd.github+json",
          ...(token ? {Authorization: `Bearer ${token}`} : {}),
        },
      });
      if (!response.ok) throw Error(`GITHUB_READ_FAILED:${response.status}`);
      const data: unknown = await response.json();
      if (!Array.isArray(data)) throw Error("GITHUB_RESPONSE_NOT_ARRAY");
      pages++;
      for (const raw of data) {
        const p = raw as GithubPR;
        if (!Number.isSafeInteger(p.number) || !["open", "closed"].includes(p.state) ||
            typeof p.title !== "string" || typeof p.html_url !== "string" ||
            typeof p.created_at !== "string" || typeof p.updated_at !== "string")
          throw Error("GITHUB_INVALID_PR");
        chapters.push({
          id: `${repository}#${p.number}`, repository, number: p.number,
          title: p.title, state: classify(p),
          createdAt: p.created_at, updatedAt: p.updated_at,
          headSha: p.head?.sha ?? null, url: p.html_url,
        });
      }
      if (data.length < PER_PAGE) { exhausted = true; break; }
    }
    if (!exhausted) truncated = true;
  }
  const unique = new Map(chapters.map(c => [c.id, c]));
  const sorted = [...unique.values()].sort((a,b) => b.number-a.number);
  const counts: Record<PRState,number> = {
    OPEN_DRAFT:0, OPEN:0, MERGED:0, CLOSED_UNMERGED:0
  };
  for (const c of sorted) counts[c.state]++;
  return {schema:"SEYMOUR_GITHUB_RESEARCH_BOOK_V1",repository,
    chapters:sorted,counts,sourcePages:pages,truncated};
}
