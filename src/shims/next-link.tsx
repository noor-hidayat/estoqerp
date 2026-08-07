import { Link } from "react-router-dom";
import type { AnchorHTMLAttributes, ReactNode } from "react";

type NextLinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
> & {
  href: string;
  replace?: boolean;
  children: ReactNode;
};

export default function NextLink({
  href,
  replace,
  children,
  ...rest
}: NextLinkProps) {
  return (
    <Link to={href} replace={replace} {...rest}>
      {children}
    </Link>
  );
}
