import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { ArticleContent } from "./ArticleContent";

describe("ArticleContent", () => {
  it("renders escaped plain text when the DOM cannot safely support sanitization", () => {
    const { container } = render(
      <ArticleContent
        html={
          '<p>Hello <script>alert(1)</script><a href="javascript:alert(1)">bad</a><a href="https://example.com/story">good</a><img src="http://example.com/a.jpg"><img src="https://example.com/b.jpg" alt="Cover"></p>'
        }
      />,
    );

    expect(container.querySelector("script")).not.toBeInTheDocument();
    expect(container.querySelector("a")).not.toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument();
  });
});
