import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FreeSpaceMetric } from "./FreeSpaceMetric";

const GiB = 1024 ** 3;

describe("FreeSpaceMetric", () => {
  it("shows the dash and unavailable aria when free space is null", () => {
    render(<FreeSpaceMetric freeBytes={null} thresholdGb={1} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute(
      "aria-label",
      expect.stringMatching(/not available|недоступно/i),
    );
  });

  it("shows the formatted value and labeled aria when available", () => {
    render(<FreeSpaceMetric freeBytes={5 * GiB} thresholdGb={1} />);
    expect(screen.getByText("5.00 GB")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute(
      "aria-label",
      expect.stringMatching(/(free space|вільно).*5\.00 GB/i),
    );
  });

  it("applies the low-space warning aria when below threshold", () => {
    render(<FreeSpaceMetric freeBytes={2 * GiB} thresholdGb={5} />);
    expect(screen.getByRole("status")).toHaveAttribute(
      "aria-label",
      expect.stringMatching(/low|мало/i),
    );
  });
});
