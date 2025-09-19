import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { useMemo } from "react"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export interface VirtualizedTableColumn<T> {
  key: string
  header: string
  width?: string
  render: (item: T) => React.ReactNode
  className?: string
}

export interface VirtualizationOptions {
  itemCount: number
  scrollTop: number
  rowHeight: number
  containerHeight: number
  overscan: number
}

export interface VirtualizationResult {
  visibleRange: { startIndex: number; endIndex: number }
  totalHeight: number
}

export function calculateVirtualization(options: VirtualizationOptions): VirtualizationResult {
  const { itemCount, scrollTop, rowHeight, containerHeight, overscan } = options
  
  // Calculate visible range
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const endIndex = Math.min(
    itemCount - 1,
    Math.ceil((scrollTop + containerHeight) / rowHeight) + overscan
  )

  return {
    visibleRange: { startIndex, endIndex },
    totalHeight: itemCount * rowHeight
  }
}

export function useVirtualization<T>(
  data: T[],
  scrollTop: number,
  rowHeight: number = 60,
  containerHeight: number = 500,
  overscan: number = 5
) {
  const virtualizationResult = useMemo(() => {
    return calculateVirtualization({
      itemCount: data.length,
      scrollTop,
      rowHeight,
      containerHeight,
      overscan
    })
  }, [data.length, scrollTop, rowHeight, containerHeight, overscan])

  const visibleItems = useMemo(() => {
    const { visibleRange } = virtualizationResult
    return data.slice(visibleRange.startIndex, visibleRange.endIndex + 1).map((item, index) => ({
      item,
      index: visibleRange.startIndex + index
    }))
  }, [data, virtualizationResult])

  return {
    ...virtualizationResult,
    visibleItems
  }
}
