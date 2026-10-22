import type { Element, Root } from "hast";
import { harden } from "rehype-harden";
import { MARKDOWN_HARDEN_OPTIONS } from "@/lib/markdown";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

const render = (src: string): Element => {
  const tree: Root = {
    type: "root",
    children: [{ type: "element", tagName: "img", properties: { src, alt: "chart" }, children: [] }],
  };
  harden(MARKDOWN_HARDEN_OPTIONS)(tree);
  return tree.children[0] as Element;
};

describe("markdown image hardening", () => {
  it.each([PNG, "/api/images/a.png"])("renders %s", (src) => {
    const node = render(src);
    expect(node.tagName).toBe("img");
    expect(node.properties.src).toBe(src);
  });

  it.each([
    "https://attacker.example/pixel.png",
    "http://attacker.example/pixel.png",
    "//attacker.example/pixel.png",
    "https://same-origin.invalid.attacker.example/pixel.png",
    "javascript:alert(1)",
  ])("blocks %s", (src) => {
    const node = render(src);
    expect(node.tagName).toBe("span");
    expect(JSON.stringify(node)).not.toContain("attacker.example");
  });

  it("still allows links to any host", () => {
    const tree: Root = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "a",
          properties: { href: "https://example.com/doc" },
          children: [{ type: "text", value: "doc" }],
        },
      ],
    };
    harden(MARKDOWN_HARDEN_OPTIONS)(tree);
    expect((tree.children[0] as Element).properties.href).toBe("https://example.com/doc");
  });
});
