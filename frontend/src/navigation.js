'use client';

import NextLink from 'next/link';
import { usePathname, useParams as useNextParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

const NAV_STATE_PREFIX = 'next_nav_state:';

function hrefFromTo(to) {
  if (typeof to === 'string') return to;
  if (!to) return '/';
  const pathname = to.pathname || '/';
  const search = to.search || '';
  const hash = to.hash || '';
  return `${pathname}${search}${hash}`;
}

function storeNavigationState(href, state) {
  if (state == null || typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(`${NAV_STATE_PREFIX}${href}`, JSON.stringify(state));
  } catch {
    /* ignore private mode / quota */
  }
}

function readNavigationState(pathname) {
  if (typeof window === 'undefined') return null;
  try {
    const direct = sessionStorage.getItem(`${NAV_STATE_PREFIX}${pathname}`);
    if (direct) return JSON.parse(direct);
  } catch {
    /* ignore invalid stored state */
  }
  return null;
}

export function Link({ to, href, state, replace: _replace, ...props }) {
  const target = href || hrefFromTo(to);
  const onClick = (event) => {
    storeNavigationState(target, state);
    props.onClick?.(event);
  };
  return <NextLink href={target} {...props} onClick={onClick} />;
}

export function NavLink({ to, end = false, className, style, ...props }) {
  const pathname = usePathname() || '/';
  const target = hrefFromTo(to);
  const active = end ? pathname === target : pathname === target || pathname.startsWith(`${target}/`);
  const resolvedClassName =
    typeof className === 'function' ? className({ isActive: active }) : [className, active ? 'active' : ''].filter(Boolean).join(' ');
  const resolvedStyle = typeof style === 'function' ? style({ isActive: active }) : style;
  return <Link to={target} className={resolvedClassName} style={resolvedStyle} {...props} />;
}

export function useNavigate() {
  const router = useRouter();
  return (to, options = {}) => {
    if (typeof to === 'number') {
      if (to < 0) router.back();
      else router.forward();
      return;
    }
    const href = hrefFromTo(to);
    storeNavigationState(href, options.state);
    if (options.replace) router.replace(href);
    else router.push(href);
  };
}

export function useLocation() {
  const pathname = usePathname() || '/';
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ? `?${searchParams.toString()}` : '';
  const [state, setState] = useState(null);

  useEffect(() => {
    setState(readNavigationState(`${pathname}${search}`) ?? readNavigationState(pathname));
  }, [pathname, search]);

  return useMemo(() => ({ pathname, search, state }), [pathname, search, state]);
}

export function useParams() {
  return useNextParams();
}

export { useSearchParams };
