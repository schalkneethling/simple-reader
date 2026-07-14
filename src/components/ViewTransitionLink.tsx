import { flushSync } from "react-dom";
import { Link, NavLink, useNavigate, type LinkProps, type NavLinkProps } from "react-router";
import type { MouseEventHandler } from "react";

type TransitionNavigationProps = Pick<
  LinkProps,
  "onClick" | "preventScrollReset" | "relative" | "replace" | "state" | "to"
>;

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function useViewTransitionClick({
  onClick,
  preventScrollReset,
  relative,
  replace,
  state,
  to,
}: TransitionNavigationProps): MouseEventHandler<HTMLAnchorElement> {
  const navigate = useNavigate();

  return (event) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey ||
      (event.currentTarget.target && event.currentTarget.target !== "_self") ||
      event.currentTarget.hasAttribute("download")
    ) {
      return;
    }

    event.preventDefault();
    const navigation = () => {
      void navigate(to, { preventScrollReset, relative, replace, state });
    };
    if (typeof document.startViewTransition === "function" && !prefersReducedMotion()) {
      document.startViewTransition(() => {
        flushSync(navigation);
      });
      return;
    }

    navigation();
  };
}

export function ViewTransitionLink({
  onClick,
  preventScrollReset,
  relative,
  replace,
  state,
  to,
  ...props
}: LinkProps) {
  const handleClick = useViewTransitionClick({
    onClick,
    preventScrollReset,
    relative,
    replace,
    state,
    to,
  });

  return <Link {...props} to={to} onClick={handleClick} />;
}

export function ViewTransitionNavLink({
  onClick,
  preventScrollReset,
  relative,
  replace,
  state,
  to,
  ...props
}: NavLinkProps) {
  const handleClick = useViewTransitionClick({
    onClick,
    preventScrollReset,
    relative,
    replace,
    state,
    to,
  });

  return <NavLink {...props} to={to} onClick={handleClick} />;
}
