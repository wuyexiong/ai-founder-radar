import React, { useId } from "react";

const DISH_PATH =
  "M10.4849 13.5151L15.133 18.1632C15.5289 18.5591 15.7513 19.0961 15.7513 19.656C15.7513 20.3394 15.4206 20.9805 14.8637 21.3766C13.3774 22.4327 11.5993 23.0001 9.776 23.0001C8.3374 23.0001 6.9207 22.6467 5.6506 21.971C2.7875 20.4461 0.999 17.4661 1 14.2222C1 12.3996 1.5673 10.6222 2.6232 9.1367C3.0193 8.5796 3.6605 8.2487 4.344 8.2487C4.9038 8.2487 5.4407 8.471 5.8366 8.8668L10.4849 13.5151Z";
const NEEDLE_PATH = "M9.7778 14.2222L12.5 11.5";
const WAVES_PATH =
  "M13.1111 6.4444C15.5657 6.4444 17.5556 8.4343 17.5556 10.8889M13.1111 2C18.0203 2 22 5.9797 22 10.8889";

/**
 * AI Founder Radar 双主题自适应品牌徽标（Keyline 几何雷达锅，MIT License）：
 * - 浅色模式（L2 Mint Paper）：白薄荷渐变底 + 深墨绿雷达锅 + 品牌蓝天线 + 翠绿电波
 * - 深色模式（F5 Obsidian）：曜石黑蓝渐变底 + 纯白雷达锅 + 冰蓝天线 + 亮翠绿电波
 */
export function BrandLogoMark({
  className = "h-8 w-8",
}: {
  className?: string;
}) {
  const uid = useId();
  const lightGradId = `${uid}-light`;
  const darkGradId = `${uid}-dark`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id={lightGradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#ECFDF5" />
        </linearGradient>
        <linearGradient id={darkGradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1E293B" />
          <stop offset="100%" stopColor="#090D16" />
        </linearGradient>
      </defs>

      {/* 浅色模式底框 */}
      <rect
        x="1"
        y="1"
        width="62"
        height="62"
        rx="15"
        fill={`url(#${lightGradId})`}
        stroke="#6EE7B7"
        strokeWidth="2"
        className="dark:hidden"
      />
      {/* 深色模式底框 */}
      <rect
        x="1"
        y="1"
        width="62"
        height="62"
        rx="15"
        fill={`url(#${darkGradId})`}
        stroke="#34D399"
        strokeOpacity="0.45"
        strokeWidth="2"
        className="hidden dark:block"
      />

      <g transform="translate(10.5 10.5) scale(1.79)">
        <path
          d={DISH_PATH}
          className="fill-[#064E3B] dark:fill-[#F8FAFC]"
        />
        <path
          fill="none"
          strokeLinecap="round"
          strokeWidth="2.2"
          d={NEEDLE_PATH}
          className="stroke-[#2563EB] dark:stroke-[#60A5FA]"
        />
        <path
          fill="none"
          strokeLinecap="round"
          strokeWidth="2.1"
          d={WAVES_PATH}
          className="stroke-[#10B981] dark:stroke-[#34D399]"
        />
      </g>
    </svg>
  );
}
