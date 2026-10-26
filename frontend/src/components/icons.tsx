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

/** FontAwesome 6 Solid: fa-circle-check (Location granted / success) */
export function IconCircleCheck(props: IconProps) {
  return (
    <FaSvg viewBox="0 0 512 512" {...props}>
      <path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z" />
    </FaSvg>
  );
}

/** FontAwesome 6 Solid: fa-location-dot (Location / GPS pin) */
export function IconLocationDot(props: IconProps) {
  return (
    <FaSvg viewBox="0 0 384 512" {...props}>
      <path d="M215.7 499.2C267 435 384 279.4 384 192C384 86 298 0 192 0S0 86 0 192c0 87.4 117 243 168.3 307.2c12.3 15.3 35.1 15.3 47.4 0zM192 128a64 64 0 1 1 0 128 64 64 0 1 1 0-128z" />
    </FaSvg>
  );
}

/** FontAwesome 6 Solid: fa-ban (Blocked / Denied) */
export function IconBan(props: IconProps) {
  return (
    <FaSvg viewBox="0 0 512 512" {...props}>
      <path d="M367.2 412.5L99.5 144.8C77.1 176.1 64 214.5 64 256c0 106 86 192 192 192c41.5 0 79.9-13.1 111.2-35.5zm45.3-45.3C434.9 335.9 448 297.5 448 256c0-106-86-192-192-192c-41.5 0-79.9 13.1-111.2 35.5L412.5 367.2zM0 256a256 256 0 1 1 512 0A256 256 0 1 1 0 256z" />
    </FaSvg>
  );
}

/** FontAwesome 6 Solid: fa-triangle-exclamation (Warning) */
export function IconTriangleExclamation(props: IconProps) {
  return (
    <FaSvg viewBox="0 0 512 512" {...props}>
      <path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z" />
    </FaSvg>
  );
}

/** FontAwesome 6 Solid: fa-gauge (Dashboard) */
export function IconGauge(props: IconProps) {
  return (
    <FaSvg viewBox="0 0 512 512" {...props}>
      <path d="M0 256a256 256 0 1 1 512 0A256 256 0 1 1 0 256zm320 96c0-26.9-16.5-49.9-40-59.3L280 88c0-13.3-10.7-24-24-24s-24 10.7-24 24l0 204.7c-23.5 9.5-40 32.5-40 59.3c0 35.3 28.7 64 64 64s64-28.7 64-64zM144 176a32 32 0 1 0 0-64 32 32 0 1 0 0 64zm-16 80a32 32 0 1 0 -64 0 32 32 0 1 0 64 0zm288 32a32 32 0 1 0 0-64 32 32 0 1 0 0 64zM368 144a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z" />
    </FaSvg>
  );
}

/** FontAwesome 6 Solid: fa-clock (My Attendance) */
export function IconClock(props: IconProps) {
  return (
    <FaSvg viewBox="0 0 512 512" {...props}>
      <path d="M256 0a256 256 0 1 1 0 512A256 256 0 1 1 256 0zM232 120l0 136c0 8 4 15.5 10.7 20l96 64c11 7.4 25.9 4.5 33.3-6.5s4.5-25.9-6.5-33.3L280 243.2 280 120c0-13.3-10.7-24-24-24s-24 10.7-24 24z" />
    </FaSvg>
  );
}

/** FontAwesome 6 Solid: fa-plane (My Leave) */
export function IconPlane(props: IconProps) {
  return (
    <FaSvg viewBox="0 0 576 512" {...props}>
      <path d="M482.3 62.5C443.7 39.1 395.7 36 354.8 54.8L257.4 99.6 60.3 32 18.9 73.4l173.6 117.2-65 29.5L42.9 192.8 0 234.5 112 272l37.5 112L192 341.6 230.8 384 272 341.1 234.8 229l65-29.5L417 372.5l41.4-41.4L390.9 134.8l95.5-44.4c40.9-19 65.5-61.5 54.4-104.1l-58.5 76.2z" />
    </FaSvg>
  );
}

/** FontAwesome 6 Solid: fa-users (Team Attendance) */
export function IconUsers(props: IconProps) {
  return (
    <FaSvg viewBox="0 0 640 512" {...props}>
      <path d="M144 160A80 80 0 1 0 144 0a80 80 0 1 0 0 160zm368 0A80 80 0 1 0 512 0a80 80 0 1 0 0 160zM0 298.7C0 310.4 9.6 320 21.3 320l597.3 0c11.8 0 21.3-9.6 21.3-21.3C640 207.6 568.4 128 480 128l-32 0c-29.4 0-57 8.1-80.7 22.2C334.4 137 310.4 128 282.7 128l-48 0C140.8 128 64 207.6 64 298.7c0 11.8 9.6 21.3 21.3 21.3zM320 160A80 80 0 1 0 320 0a80 80 0 1 0 0 160zm0 192c-44.2 0-80 35.8-80 80l0 64c0 17.7 14.3 32 32 32l96 0c17.7 0 32-14.3 32-32l0-64c0-44.2-35.8-80-80-80z" />
    </FaSvg>
  );
}

/** FontAwesome 6 Solid: fa-clipboard-check (Approvals) */
export function IconClipboardCheck(props: IconProps) {
  return (
    <FaSvg viewBox="0 0 384 512" {...props}>
      <path d="M192 0c-41.8 0-77.4 26.7-90.5 64L64 64C28.7 64 0 92.7 0 128L0 448c0 35.3 28.7 64 64 64l256 0c35.3 0 64-28.7 64-64l0-320c0-35.3-28.7-64-64-64l-37.5 0C269.4 26.7 233.8 0 192 0zm0 64a32 32 0 1 1 0 64 32 32 0 1 1 0-64zM111 273L175 209c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9l-80 80c-9.4 9.4-24.6 9.4-33.9 0l-40-40c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l23 23 .1-.1z" />
    </FaSvg>
  );
}

/** FontAwesome 6 Solid: fa-chart-bar (Reports) */
export function IconChartBar(props: IconProps) {
  return (
    <FaSvg viewBox="0 0 512 512" {...props}>
      <path d="M32 32c17.7 0 32 14.3 32 32l0 336 224 0 0-208c0-17.7 14.3-32 32-32l160 0c17.7 0 32 14.3 32 32l0 208 32 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-32 0-224 0L64 464l-32 0c-17.7 0-32-14.3-32-32L0 64C0 46.3 14.3 32 32 32zm96 96a32 32 0 1 1 64 0 32 32 0 1 1 -64 0zm32 64a32 32 0 1 1 0 64 32 32 0 1 1 0-64zm-32 128a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z" />
    </FaSvg>
  );
}

/** FontAwesome 6 Solid: fa-id-card (Employees) */
export function IconIdCard(props: IconProps) {
  return (
    <FaSvg viewBox="0 0 576 512" {...props}>
      <path d="M528 32l-480 0C21.5 32 0 53.5 0 80L0 432c0 26.5 21.5 48 48 48l480 0c26.5 0 48-21.5 48-48l0-352c0-26.5-21.5-48-48-48zM208 256a64 64 0 1 1 0-128 64 64 0 1 1 0 128zm-48 32l96 0c44.2 0 80 35.8 80 80c0 8.8-7.2 16-16 16l-224 0c-8.8 0-16-7.2-16-16c0-44.2 35.8-80 80-80zm272-32l-112 0c-8.8 0-16-7.2-16-16s7.2-16 16-16l112 0c8.8 0 16 7.2 16 16s-7.2 16-16 16zm0-64l-112 0c-8.8 0-16-7.2-16-16s7.2-16 16-16l112 0c8.8 0 16 7.2 16 16s-7.2 16-16 16zm0-64l-112 0c-8.8 0-16-7.2-16-16s7.2-16 16-16l112 0c8.8 0 16 7.2 16 16s-7.2 16-16 16z" />
    </FaSvg>
  );
}

/** FontAwesome 6 Solid: fa-sliders (Policies & Setup) */
export function IconSliders(props: IconProps) {
  return (
    <FaSvg viewBox="0 0 512 512" {...props}>
      <path d="M0 416c0 17.7 14.3 32 32 32l54.7 0c12.3 28.3 40.5 48 73.3 48s61-19.7 73.3-48L480 448c17.7 0 32-14.3 32-32s-14.3-32-32-32l-246.7 0c-12.3-28.3-40.5-48-73.3-48s-61 19.7-73.3 48L32 384c-17.7 0-32 14.3-32 32zm128 0a32 32 0 1 1 64 0 32 32 0 1 1 -64 0zM320 256a32 32 0 1 1 64 0 32 32 0 1 1 -64 0zm32-80c-32.8 0-61 19.7-73.3 48L32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l246.7 0c12.3 28.3 40.5 48 73.3 48s61-19.7 73.3-48l54.7 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-54.7 0c-12.3-28.3-40.5-48-73.3-48zM192 128a32 32 0 1 1 0-64 32 32 0 1 1 0 64zm73.3-48C253 51.7 224.8 32 192 32s-61 19.7-73.3 48L32 80C14.3 80 0 94.3 0 112s14.3 32 32 32l86.7 0c12.3 28.3 40.5 48 73.3 48s61-19.7 73.3-48L480 144c17.7 0 32-14.3 32-32s-14.3-32-32-32L265.3 80z" />
    </FaSvg>
  );
}

/** FontAwesome 6 Solid: fa-scroll (Audit Log) */
export function IconScroll(props: IconProps) {
  return (
    <FaSvg viewBox="0 0 576 512" {...props}>
      <path d="M0 80C0 53.5 21.5 32 48 32l96 0C220.5 32 256 67.5 256 112l0 352c0 26.5-21.5 48-48 48l-160 0c-26.5 0-48-21.5-48-48L0 80zM208 272l0-192-96 0c-8.8 0-16 7.2-16 16s7.2 16 16 16l16 0c8.8 0 16 7.2 16 16s-7.2 16-16 16l-16 0c-26.5 0-48-21.5-48-48s21.5-48 48-48l96 0 0 224-96 0c-8.8 0-16 7.2-16 16s7.2 16 16 16l16 0c8.8 0 16 7.2 16 16s-7.2 16-16 16l-16 0c-26.5 0-48-21.5-48-48s21.5-48 48-48l96 0zM336 32l96 0 64 0c26.5 0 48 21.5 48 48s-21.5 48-48 48l-16 0c-8.8 0-16 7.2-16 16s7.2 16 16 16l16 0c26.5 0 48 21.5 48 48s-21.5 48-48 48l-144 0 0-224zm0 256l144 0c26.5 0 48 21.5 48 48s-21.5 48-48 48l-16 0c-8.8 0-16 7.2-16 16s7.2 16 16 16l16 0c26.5 0 48 21.5 48 48s-21.5 48-48 48l-96 0-48 0 0-224z" />
    </FaSvg>
  );
}

/** FontAwesome 6 Solid: fa-house (Work From Home) */
export function IconHouse(props: IconProps) {
  return (
    <FaSvg viewBox="0 0 576 512" {...props}>
      <path d="M575.8 255.5c0 18-15 32.1-32 32.1l-32 0 .7 160.2c0 2.7-.2 5.4-.5 8.1l0 16.2c0 22.1-17.9 40-40 40l-16 0c-1.1 0-2.2 0-3.3-.1c-1.4 .1-2.8 .1-4.2 .1L416 512l-24 0c-22.1 0-40-17.9-40-40l0-24 0-64c0-17.7-14.3-32-32-32l-64 0c-17.7 0-32 14.3-32 32l0 64 0 24c0 22.1-17.9 40-40 40l-24 0-31.9 0c-1.5 0-3-.1-4.5-.2c-1.2 .1-2.4 .2-3.6 .2l-16 0c-22.1 0-40-17.9-40-40l0-112c0-.9 0-1.9 .1-2.8l0-69.7-32 0c-18 0-32-14-32-32.1c0-9 3-17 10-24L266.4 8c7-7 15-8 22-8s15 2 21 7L564.8 231.5c8 7 12 15 11 24z" />
    </FaSvg>
  );
}

/** FontAwesome 6 Solid: fa-lock (Browser lock icon - for help text) */
export function IconLock(props: IconProps) {
  return (
    <FaSvg viewBox="0 0 448 512" {...props}>
      <path d="M144 144l0 48 160 0 0-48c0-44.2-35.8-80-80-80s-80 35.8-80 80zM80 192l0-48C80 64.5 144.5 0 224 0s144 64.5 144 144l0 48 16 0c35.3 0 64 28.7 64 64l0 192c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64L0 256c0-35.3 28.7-64 64-64l16 0z" />
    </FaSvg>
  );
}

/** FontAwesome 6 Solid: fa-shield (Browser shield icon - for help text) */
export function IconShield(props: IconProps) {
  return (
    <FaSvg viewBox="0 0 512 512" {...props}>
      <path d="M256 0c4.6 0 9.2 1 13.4 2.9L457.7 82.8c22 9.3 38.4 31 38.3 57.2c-.5 99.2-41.3 280.7-213.6 363.2c-16.7 8-36.1 8-52.8 0C57.3 420.7 16.5 239.2 16 140c-.1-26.2 16.3-47.9 38.3-57.2L242.7 2.9C246.8 1 251.4 0 256 0z" />
    </FaSvg>
  );
}

/** FontAwesome 6 Solid: fa-map-pin (Address / location heading) */
export function IconMapPin(props: IconProps) {
  return (
    <FaSvg viewBox="0 0 320 512" {...props}>
      <path d="M16 144a144 144 0 1 1 288 0A144 144 0 1 1 16 144zM160 80c8.8 0 16-7.2 16-16s-7.2-16-16-16c-53 0-96 43-96 96c0 8.8 7.2 16 16 16s16-7.2 16-16c0-35.3 28.7-64 64-64zM128 480l0-68.8c-42.1-8.5-78.4-32.1-103-65.2L128 480zm64 0l103-134c-24.6 33.1-60.9 56.7-103 65.2L192 480z" />
    </FaSvg>
  );
}

/** FontAwesome 6 Solid: fa-calendar-days (Upcoming holidays / Calendar) */
export function IconCalendarDays(props: IconProps) {
  return (
    <FaSvg viewBox="0 0 448 512" {...props}>
      <path d="M128 0c17.7 0 32 14.3 32 32l0 32 128 0 0-32c0-17.7 14.3-32 32-32s32 14.3 32 32l0 32 48 0c26.5 0 48 21.5 48 48l0 48L0 160l0-48C0 85.5 21.5 64 48 64l48 0 0-32c0-17.7 14.3-32 32-32zM0 192l448 0 0 272c0 26.5-21.5 48-48 48L48 512c-26.5 0-48-21.5-48-48L0 192zm64 80l0 48c0 8.8 7.2 16 16 16l48 0c8.8 0 16-7.2 16-16l0-48c0-8.8-7.2-16-16-16l-48 0c-8.8 0-16 7.2-16 16zm128 0l0 48c0 8.8 7.2 16 16 16l48 0c8.8 0 16-7.2 16-16l0-48c0-8.8-7.2-16-16-16l-48 0c-8.8 0-16 7.2-16 16zm144-16c-8.8 0-16 7.2-16 16l0 48c0 8.8 7.2 16 16 16l48 0c8.8 0 16-7.2 16-16l0-48c0-8.8-7.2-16-16-16l-48 0zM64 400l0 48c0 8.8 7.2 16 16 16l48 0c8.8 0 16-7.2 16-16l0-48c0-8.8-7.2-16-16-16l-48 0c-8.8 0-16 7.2-16 16zm144-16c-8.8 0-16 7.2-16 16l0 48c0 8.8 7.2 16 16 16l48 0c8.8 0 16-7.2 16-16l0-48c0-8.8-7.2-16-16-16l-48 0zm144 0c-8.8 0-16 7.2-16 16l0 48c0 8.8 7.2 16 16 16l48 0c8.8 0 16-7.2 16-16l0-48c0-8.8-7.2-16-16-16l-48 0z" />
    </FaSvg>
  );
}

/** FontAwesome 6 Solid: fa-chevron-left */
export function IconChevronLeft(props: IconProps) {
  return (
    <FaSvg viewBox="0 0 320 512" {...props}>
      <path d="M9.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l192 192c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L77.3 256 246.6 86.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-192 192z" />
    </FaSvg>
  );
}

/** FontAwesome 6 Solid: fa-chevron-right */
export function IconChevronRight(props: IconProps) {
  return (
    <FaSvg viewBox="0 0 320 512" {...props}>
      <path d="M310.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-192 192c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L242.7 256 73.4 86.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l192 192z" />
    </FaSvg>
  );
}

