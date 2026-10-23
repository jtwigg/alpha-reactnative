declare namespace React {
  namespace JSX {
    interface IntrinsicElements {
      svg: React.SVGProps<SVGSVGElement>;
      path: React.SVGProps<SVGPathElement>;
      line: React.SVGProps<SVGLineElement>;
      g: React.SVGProps<SVGGElement>;
      text: React.SVGProps<SVGTextElement>;
    }
  }
}
