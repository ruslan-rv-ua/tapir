import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ListCard, ListCardState } from "./ListCard";

describe("ListCard", () => {
  it("renders children inside the framed container", () => {
    render(
      <ListCard>
        <span>card content</span>
      </ListCard>,
    );
    expect(screen.getByText("card content")).toBeInTheDocument();
  });
});

describe("ListCardState", () => {
  it("renders its children", () => {
    render(<ListCardState>empty message</ListCardState>);
    expect(screen.getByText("empty message")).toBeInTheDocument();
  });

  it("forwards role and aria-live to the container", () => {
    render(
      <ListCardState role="alert" aria-live="assertive">
        boom
      </ListCardState>,
    );
    const el = screen.getByRole("alert");
    expect(el).toHaveTextContent("boom");
    expect(el).toHaveAttribute("aria-live", "assertive");
  });

  it("uses the default text color when no className is given", () => {
    render(<ListCardState role="status">x</ListCardState>);
    expect(screen.getByRole("status").className).toContain("text-slate-500");
  });

  it("uses the provided className instead of the default color", () => {
    render(
      <ListCardState role="status" className="text-red-400">
        x
      </ListCardState>,
    );
    const el = screen.getByRole("status");
    expect(el.className).toContain("text-red-400");
    expect(el.className).not.toContain("text-slate-500");
  });
});
