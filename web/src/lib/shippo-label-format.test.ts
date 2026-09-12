import { describe, expect, it } from "vitest";
import {
  buildLabelPrintPagePath,
  isAllowedShippoLabelUrl,
  parseCreateLabelRequestBody,
  parseSellerLabelPrintFormat,
  shippoLabelFileTypeForPrintFormat,
} from "@/lib/shippo-label-format";

describe("shippoLabelFileTypeForPrintFormat", () => {
  it("maps thermal to PDF_4x6", () => {
    expect(shippoLabelFileTypeForPrintFormat("thermal_4x6")).toBe("PDF_4x6");
    expect(shippoLabelFileTypeForPrintFormat("letter")).toBe("PDF");
  });
});

describe("parseSellerLabelPrintFormat", () => {
  it("defaults unknown values to letter", () => {
    expect(parseSellerLabelPrintFormat("thermal_4x6")).toBe("thermal_4x6");
    expect(parseSellerLabelPrintFormat("")).toBe("letter");
    expect(parseSellerLabelPrintFormat(undefined)).toBe("letter");
  });
});

describe("isAllowedShippoLabelUrl", () => {
  it("allows Shippo S3 label URLs", () => {
    expect(
      isAllowedShippoLabelUrl("https://shippo-delivery.s3.amazonaws.com/some-label.pdf"),
    ).toBe(true);
  });

  it("rejects arbitrary hosts", () => {
    expect(isAllowedShippoLabelUrl("https://evil.example/label.pdf")).toBe(false);
    expect(isAllowedShippoLabelUrl("http://shippo-delivery.s3.amazonaws.com/x.pdf")).toBe(false);
  });
});

describe("buildLabelPrintPagePath", () => {
  it("encodes src and format", () => {
    const path = buildLabelPrintPagePath("https://shippo-delivery.s3.amazonaws.com/a.pdf", "thermal_4x6");
    expect(path).toContain("/account/sales/print-label?");
    expect(path).toContain("format=4x6");
    expect(path).toContain(encodeURIComponent("https://shippo-delivery.s3.amazonaws.com/a.pdf"));
  });
});

describe("parseCreateLabelRequestBody", () => {
  it("reads labelFormat from POST JSON and defaults to 4x6 thermal", () => {
    expect(parseCreateLabelRequestBody({ labelFormat: "thermal_4x6" })).toBe("thermal_4x6");
    expect(parseCreateLabelRequestBody({ labelFormat: "letter" })).toBe("letter");
    expect(parseCreateLabelRequestBody({})).toBe("thermal_4x6");
    expect(parseCreateLabelRequestBody(null)).toBe("thermal_4x6");
  });
});
