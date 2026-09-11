import React, { type ReactNode } from 'react'

export interface MetricStripProps {
  children: ReactNode
  columns?: 2 | 3 | 4 | 5
  className?: string
}

const columnClasses: Record<number, string> = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-3',
  4: 'grid-cols-2 md:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
}

export const MetricStrip: React.FC<MetricStripProps> = ({
  children,
  columns = 4,
  className = '',
}) => {
  return (
    <div
      className={`
        grid gap-3 sm:gap-4
        ${columnClasses[columns] || columnClasses[4]}
        ${className}
      `.trim()}
    >
      {children}
    </div>
  )
}

export default MetricStrip
