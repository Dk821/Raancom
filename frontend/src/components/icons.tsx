import { SVGProps } from 'react';

export interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number | string;
}

/**
 * Base SVG wrapper for FontAwesome solid icons.
 * Inherits currentColor and scales proportionally.
 */
function FaSvg({ size = 16, viewBox = '0 0 512 512', children, ...props }: IconProps & { viewBox?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="currentColor"
      aria-hidden="true"
      style={{ display: 'inline-block', verticalAlign: '-0.125em', flexShrink: 0 }}
      {...props}
    >
      {children}
    </svg>
  );
}

/** FontAwesome 6 Solid: fa-bars (Hamburger menu) */
export function IconBars(props: IconProps) {
  return (
    <FaSvg viewBox="0 0 448 512" {...props}>
      <path d="M0 96C0 78.3 14.3 64 32 64l384 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 128C14.3 128 0 113.7 0 96zM0 256c0-17.7 14.3-32 32-32l384 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 288c-17.7 0-32-14.3-32-32zM448 416c0 17.7-14.3 32-32 32L32 448c-17.7 0-32-14.3-32-32s14.3-32 32-32l384 0c17.7 0 32 14.3 32 32z" />
    </FaSvg>
  );
}

/** FontAwesome 6 Solid: fa-xmark (Close / Dismiss) */
export function IconXmark(props: IconProps) {
  return (
    <FaSvg viewBox="0 0 384 512" {...props}>
      <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z" />
    </FaSvg>
  );
}

/** FontAwesome 6 Solid: fa-sun (Light theme) */
export function IconSun(props: IconProps) {
  return (
    <FaSvg viewBox="0 0 512 512" {...props}>
      <path d="M361.5 1.2c5 2.1 8.6 6.6 9.6 11.9L391 121l107.9 19.8c5.3 1 9.8 4.6 11.9 9.6s1.5 10.7-1.6 15.2L446.9 256l62.3 90.5c3.1 4.5 3.7 10.2 1.6 15.2s-6.6 8.6-11.9 9.6L391 391 371.1 498.9c-1 5.3-4.6 9.8-9.6 11.9s-10.7 1.5-15.2-1.6L256 446.9l-90.5 62.3c-4.5 3.1-10.2 3.7-15.2 1.6s-8.6-6.6-9.6-11.9L121 391 13.1 371.1c-5.3-1-9.8-4.6-11.9-9.6s-1.5-10.7 1.6-15.2L65.1 256 2.8 165.5c-3.1-4.5-3.7-10.2-1.6-15.2s6.6-8.6 11.9-9.6L121 121 140.9 13.1c1-5.3 4.6-9.8 9.6-11.9s10.7-1.5 15.2 1.6L256 65.1 346.5 2.8c4.5-3.1 10.2-3.7 15.2-1.6zM160 256a96 96 0 1 1 192 0 96 96 0 1 1 -192 0zm224 0a128 128 0 1 0 -256 0 128 128 0 1 0 256 0z" />
    </FaSvg>
  );
}

/** FontAwesome 6 Solid: fa-moon (Dark theme) */
export function IconMoon(props: IconProps) {
  return (
    <FaSvg viewBox="0 0 384 512" {...props}>
      <path d="M223.5 32C100 32 0 132.3 0 256S100 480 223.5 480c60.6 0 115.5-24.2 155.8-63.4c5-4.9 6.3-12.5 3.1-18.7s-10.1-9.7-17-8.5c-9.8 1.7-19.8 2.6-30.1 2.6c-96.9 0-175.5-78.8-175.5-176c0-65.8 36-123.1 89.3-153.3c6.1-3.5 9.2-10.5 7.7-17.3s-7.3-11.9-14.3-12.5c-6.3-.5-12.6-.8-19-.8z" />
    </FaSvg>
  );
}

/** FontAwesome 6 Solid: fa-desktop (System theme) */
export function IconDesktop(props: IconProps) {
  return (
    <FaSvg viewBox="0 0 576 512" {...props}>
      <path d="M64 0C28.7 0 0 28.7 0 64L0 352c0 35.3 28.7 64 64 64l176 0-10.7 32L160 448c-17.7 0-32 14.3-32 32s14.3 32 32 32l256 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-69.3 0-10.7-32 176 0c35.3 0 64-28.7 64-64l0-288c0-35.3-28.7-64-64-64L64 0zM512 64l0 256L64 320 64 64l448 0z" />
    </FaSvg>
  );
}

/** FontAwesome 6 Solid: fa-bell (Notification bell) */
export function IconBell(props: IconProps) {
  return (
    <FaSvg viewBox="0 0 448 512" {...props}>
      <path d="M224 0c-17.7 0-32 14.3-32 32l0 19.2C119 66 64 130.6 64 208l0 18.8c0 47-17.3 92.4-48.5 127.6l-7.4 8.3c-8.4 9.4-10.4 22.9-5.3 34.4S19.4 416 32 416l384 0c12.6 0 24-7.4 29.2-18.9s3.1-25-5.3-34.4l-7.4-8.3C401.3 319.2 384 273.9 384 226.8l0-18.8c0-77.4-55-142-128-156.8L256 32c0-17.7-14.3-32-32-32zm45.3 464l-90.7 0c3.6 27.8 27.6 48 56.4 48s52.8-20.2 56.4-48z" />
    </FaSvg>
  );
}

/** FontAwesome 6 Solid: fa-bell-slash (Notifications disabled/empty) */
export function IconBellSlash(props: IconProps) {
  return (
    <FaSvg viewBox="0 0 640 512" {...props}>
      <path d="M38.8 5.1C28.4-3.1 13.3-1.2 5.1 9.2S-1.2 34.7 9.2 42.9l592 464c10.4 8.2 25.5 6.3 33.7-4.1s6.3-25.5-4.1-33.7L513.3 376.6c-4.9-10.2-7.3-21.5-7.3-33l0-18.8c0-77.4-55-142-128-156.8L378 136c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 19.2c-23.7 4.8-45.3 15-63.5 29.3L38.8 5.1zM365.3 464l-90.7 0c3.6 27.8 27.6 48 56.4 48s52.8-20.2 56.4-48zM160 274.7l0-47.9c0-14.4 2.1-28.3 6-41.4L114.7 144.1C98.4 167.3 89.6 195.2 89.6 226.8l0 18.8c0 47-17.3 92.4-48.5 127.6l-7.4 8.3c-8.4 9.4-10.4 22.9-5.3 34.4S47.4 432 60 432l368.7 0L383 395.3c-2.4-1.9-4.8-3.9-7.1-6L348 360.7l-188-147.5 0 61.5z" />
    </FaSvg>
  );
}

/** FontAwesome 6 Solid: fa-circle-user (User avatar / profile) */
export function IconUser(props: IconProps) {
  return (
    <FaSvg viewBox="0 0 512 512" {...props}>
      <path d="M256 0a256 256 0 1 0 0 512A256 256 0 1 0 256 0zM128 405.3c0-35.3 28.7-64 64-64l128 0c35.3 0 64 28.7 64 64 0 6.6-1 13.1-3 19.2C343.8 456.9 302.2 480 256 480s-87.8-23.1-125-55.5c-2-6.1-3-12.6-3-19.2zm128-117.3a80 80 0 1 1 0-160 80 80 0 1 1 0 160z" />
    </FaSvg>
  );
}

/** FontAwesome 6 Solid: fa-right-from-bracket (Sign out / Logout) */
export function IconSignOut(props: IconProps) {
  return (
    <FaSvg viewBox="0 0 512 512" {...props}>
      <path d="M377.9 105.9L500.7 228.7c7.2 7.2 11.3 17.1 11.3 27.3s-4.1 20.1-11.3 27.3L377.9 406.1c-6.4 6.4-15 9.9-24 9.9c-18.7 0-33.9-15.2-33.9-33.9l0-62.1-128 0c-17.7 0-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32l128 0 0-62.1c0-18.7 15.2-33.9 33.9-33.9c9 0 17.6 3.6 24 9.9zM160 96L96 96c-17.7 0-32 14.3-32 32l0 256c0 17.7 14.3 32 32 32l64 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-64 0c-53 0-96-43-96-96L0 128C0 75 43 32 96 32l64 0c17.7 0 32 14.3 32 32s-14.3 32-32 32z" />
    </FaSvg>
  );
}

/** FontAwesome 6 Solid: fa-building (Company / Office) */
export function IconBuilding(props: IconProps) {
  return (
    <FaSvg viewBox="0 0 384 512" {...props}>
      <path d="M48 0C21.5 0 0 21.5 0 48L0 464c0 26.5 21.5 48 48 48l96 0 0-80c0-26.5 21.5-48 48-48s48 21.5 48 48l0 80 96 0c26.5 0 48-21.5 48-48l0-416c0-26.5-21.5-48-48-48L48 0zM96 64l48 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-48 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16zm0 128l48 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-48 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16zm144-128l48 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-48 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16zm0 128l48 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-48 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16zM96 320l48 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-48 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16zm144 0l48 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-48 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16z" />
    </FaSvg>
  );
}

/** FontAwesome 6 Solid: fa-check-double (Mark all read) */
export function IconCheckDouble(props: IconProps) {
  return (
    <FaSvg viewBox="0 0 448 512" {...props}>
      <path d="M342.6 86.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L160 178.7l-57.4-57.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l80 80c12.5 12.5 32.8 12.5 45.3 0l160-160zm96 128c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L160 402.7 54.6 297.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l256-256z" />
    </FaSvg>
  );
}
