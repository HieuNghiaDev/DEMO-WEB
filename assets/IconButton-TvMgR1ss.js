import{a as e,l as t,o as n,t as r}from"./ButtonSpinner-Ds03i8Tf.js";var i=t(n(),1),a=e(),o={ghost:`bg-transparent text-[var(--tm-text-secondary)] hover:text-[var(--tm-text-primary)] hover:bg-[var(--tm-surface-hover)] active:bg-[var(--tm-surface-active)] border border-transparent`,outline:`bg-transparent text-[var(--tm-text-primary)] hover:bg-[var(--tm-surface-hover)] border border-[var(--tm-border)] active:bg-[var(--tm-surface-active)]`,secondary:`bg-[var(--tm-surface-elevated)] text-[var(--tm-text-primary)] hover:bg-[var(--tm-surface-hover)] border border-[var(--tm-border)] active:bg-[var(--tm-surface-active)] shadow-xs`,primary:`bg-[var(--tm-primary)] text-white hover:bg-[var(--tm-primary-hover)] active:opacity-95 shadow-sm border border-transparent disabled:bg-[var(--tm-primary)]/50`},s={sm:`h-7 w-7 rounded-md p-1 [&_svg]:h-3.5 [&_svg]:w-3.5`,md:`h-9 w-9 rounded-lg p-2 [&_svg]:h-4 [&_svg]:w-4`,lg:`h-10 w-10 rounded-lg p-2.5 [&_svg]:h-5 [&_svg]:w-5`},c=i.forwardRef(function({variant:e=`ghost`,size:t=`md`,loading:n=!1,disabled:i=!1,className:c=``,children:l,title:u,"aria-label":d,...f},p){return(0,a.jsx)(`button`,{ref:p,"aria-label":d,title:u||d,disabled:i||n,className:`
        inline-flex items-center justify-center select-none shrink-0
        transition-all duration-150 ease-out
        active:scale-[0.95] disabled:active:scale-100
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tm-focus-ring)] focus-visible:ring-offset-1
        disabled:cursor-not-allowed disabled:opacity-50
        ${o[e]}
        ${s[t]}
        ${c}
      `.trim(),...f,children:n?(0,a.jsx)(r,{className:`h-4 w-4`}):l})});export{c as t};