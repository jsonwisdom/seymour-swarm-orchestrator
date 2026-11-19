import {describe,it,expect,vi} from "vitest";
import {discoverGithubResearchBook} from "../src/github-research-book";
const p = (number:number,state:"open"|"closed",draft=false,merged_at:string|null=null)=>({
  number,state,draft,merged_at,title:"Chapter "+number,created_at:"2026-01-01",
  updated_at:"2026-11-18",html_url:"https://github.com/jsonwisdom/COMPUTERWISDOM/pull/"+number,
  head:{sha:"abc"}
});
describe("Seymour read-only research book",()=>{
  it("separates draft, open, merged and closed-unmerged",async()=>{
    const fetcher=vi.fn(async(url:string)=>new Response(JSON.stringify(
      url.includes("state=open")?[p(4,"open",true),p(3,"open")]:
      [p(2,"closed",false,"2026-01-02"),p(1,"closed")]),{status:200}));
    const book=await discoverGithubResearchBook("jsonwisdom/COMPUTERWISDOM",fetcher);
    expect(book.counts).toEqual({OPEN_DRAFT:1,OPEN:1,MERGED:1,CLOSED_UNMERGED:1});
    expect(book.chapters.map(x=>x.number)).toEqual([4,3,2,1]);
    expect(book.truncated).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.every(c=>c[0].startsWith("https://api.github.com/"))).toBe(true);
  });
  it("fails closed on failed GitHub reads",async()=>{
    await expect(discoverGithubResearchBook("jsonwisdom/COMPUTERWISDOM",
      async()=>new Response("no",{status:403}))).rejects.toThrow("GITHUB_READ_FAILED:403");
  });
  it("does not invent completeness at pagination limit",async()=>{
    const full=Array.from({length:100},(_,i)=>p(i+1,"open"));
    const fetcher=vi.fn(async()=>new Response(JSON.stringify(full),{status:200}));
    const book=await discoverGithubResearchBook("jsonwisdom/COMPUTERWISDOM",fetcher,undefined,1);
    expect(book.truncated).toBe(true);
    expect(book.sourcePages).toBe(2);
  });
  it("rejects malformed repository and invalid page limits",async()=>{
    const fetcher=vi.fn(async()=>new Response("[]"));
    await expect(discoverGithubResearchBook("https://example.com",fetcher)).rejects.toThrow();
    await expect(discoverGithubResearchBook("jsonwisdom/COMPUTERWISDOM",fetcher,undefined,0)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
