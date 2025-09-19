import { useState, useEffect, useRef } from 'react'

interface SmartSearchProps {
  placeholder?: string
  onSearch: (query: string, filters: SearchFilters) => void
  predictors?: Predictor[]
  className?: string
}

interface Predictor {
  id: string
  label: string
  type: 'year' | 'client' | 'category' | 'status' | 'vendor' | 'custom'
  value: string
  count?: number
}

interface SearchFilters {
  text: string
  year?: string
  client?: string
  category?: string
  status?: string
  vendor?: string
}

// Simple fuzzy search function
function fuzzyMatch(text: string, query: string): boolean {
  if (!query) return true
  
  const cleanText = text.toLowerCase().replace(/[^a-z0-9]/g, '')
  const cleanQuery = query.toLowerCase().replace(/[^a-z0-9]/g, '')
  
  // Exact match
  if (cleanText.includes(cleanQuery)) return true
  
  // Fuzzy match - check if all characters in query exist in text in order
  let queryIndex = 0
  for (let i = 0; i < cleanText.length && queryIndex < cleanQuery.length; i++) {
    if (cleanText[i] === cleanQuery[queryIndex]) {
      queryIndex++
    }
  }
  return queryIndex === cleanQuery.length
}

// Levenshtein distance for fuzzy matching
function levenshteinDistance(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null))

  for (let i = 0; i <= str1.length; i++) {
    matrix[0][i] = i
  }

  for (let j = 0; j <= str2.length; j++) {
    matrix[j][0] = j
  }

  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      if (str2[j - 1] === str1[i - 1]) {
        matrix[j][i] = matrix[j - 1][i - 1]
      } else {
        matrix[j][i] = Math.min(
          matrix[j - 1][i - 1] + 1, // substitution
          matrix[j][i - 1] + 1,     // insertion
          matrix[j - 1][i] + 1      // deletion
        )
      }
    }
  }

  return matrix[str2.length][str1.length]
}

// Better fuzzy search with scoring
function fuzzyScore(text: string, query: string): number {
  if (!query) return 0
  
  const cleanText = text.toLowerCase()
  const cleanQuery = query.toLowerCase()
  
  // Exact match gets highest score
  if (cleanText.includes(cleanQuery)) return 100
  
  // Use Levenshtein distance for fuzzy scoring
  const maxLength = Math.max(cleanText.length, cleanQuery.length)
  const distance = levenshteinDistance(cleanText, cleanQuery)
  const score = ((maxLength - distance) / maxLength) * 100
  
  return score > 30 ? score : 0 // Only return scores above threshold
}

export function SmartSearch({ placeholder = "Search...", onSearch, predictors = [], className = "" }: SmartSearchProps) {
  const [query, setQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [filteredPredictors, setFilteredPredictors] = useState<Predictor[]>([])
  const [selectedFilters, setSelectedFilters] = useState<SearchFilters>({ text: '' })
  const [focusedIndex, setFocusedIndex] = useState(-1)
  
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Filter predictors based on query with fuzzy search
  useEffect(() => {
    if (!query.trim()) {
      setFilteredPredictors(predictors.slice(0, 10)) // Show top 10 when empty
      return
    }

    const scored = predictors
      .map(predictor => ({
        ...predictor,
        score: fuzzyScore(predictor.label, query)
      }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8) // Limit to 8 results
      .map(({ score, ...predictor }) => predictor)

    setFilteredPredictors(scored)
  }, [query, predictors])

  // Trigger search when query or filters change
  useEffect(() => {
    const searchFilters = { ...selectedFilters, text: query }
    onSearch(query, searchFilters)
  }, [query, selectedFilters, onSearch])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)
    setShowDropdown(true)
    setFocusedIndex(-1)
  }

  const handlePredictorClick = (predictor: Predictor) => {
    // Apply the predictor as a filter
    const newFilters = { ...selectedFilters }
    
    if (predictor.type === 'year') {
      newFilters.year = predictor.value
    } else if (predictor.type === 'client') {
      newFilters.client = predictor.value
    } else if (predictor.type === 'category') {
      newFilters.category = predictor.value
    } else if (predictor.type === 'status') {
      newFilters.status = predictor.value
    } else if (predictor.type === 'vendor') {
      newFilters.vendor = predictor.value
    }
    
    setSelectedFilters(newFilters)
    setQuery(predictor.label)
    setShowDropdown(false)
    inputRef.current?.focus()
  }

  const removeFilter = (filterType: keyof SearchFilters) => {
    const newFilters = { ...selectedFilters }
    delete newFilters[filterType]
    setSelectedFilters(newFilters)
    
    if (filterType !== 'text') {
      setQuery('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || filteredPredictors.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIndex(prev => 
        prev < filteredPredictors.length - 1 ? prev + 1 : 0
      )
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIndex(prev => 
        prev > 0 ? prev - 1 : filteredPredictors.length - 1
      )
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (focusedIndex >= 0 && focusedIndex < filteredPredictors.length) {
        handlePredictorClick(filteredPredictors[focusedIndex])
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false)
      setFocusedIndex(-1)
    }
  }

  const handleFocus = () => {
    setShowDropdown(true)
  }

  const handleBlur = (e: React.FocusEvent) => {
    // Don't hide dropdown if clicking on it
    if (dropdownRef.current?.contains(e.relatedTarget as Node)) {
      return
    }
    setTimeout(() => setShowDropdown(false), 200)
  }

  const getFilterIcon = (type: string) => {
    switch (type) {
      case 'year':
        return (
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        )
      case 'client':
        return (
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        )
      case 'category':
        return (
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
        )
      case 'status':
        return (
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      case 'vendor':
        return (
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        )
      default:
        return (
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        )
    }
  }

  return (
    <div className={`relative ${className}`}>
      {/* Active Filters */}
      {Object.entries(selectedFilters).length > 1 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {Object.entries(selectedFilters).map(([key, value]) => {
            if (key === 'text' || !value) return null
            return (
              <span
                key={key}
                className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-lg text-xs font-medium"
              >
                {getFilterIcon(key)}
                {key}: {value}
                <button
                  onClick={() => removeFilter(key as keyof SearchFilters)}
                  className="ml-1 hover:bg-primary/20 rounded p-0.5"
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            )
          })}
        </div>
      )}

      {/* Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg className="h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          className="w-full pl-10 pr-4 py-2 rounded-xl bg-background border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
        />
      </div>

      {/* Dropdown */}
      {showDropdown && filteredPredictors.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-card border border-border rounded-xl shadow-lg max-h-64 overflow-auto"
        >
          {filteredPredictors.map((predictor, index) => (
            <button
              key={predictor.id}
              onClick={() => handlePredictorClick(predictor)}
              className={`w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors flex items-center gap-2 ${
                index === focusedIndex ? 'bg-muted/50' : ''
              } ${index === 0 ? 'rounded-t-xl' : ''} ${
                index === filteredPredictors.length - 1 ? 'rounded-b-xl' : ''
              }`}
            >
              <div className="text-muted-foreground">
                {getFilterIcon(predictor.type)}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-card-foreground">
                  {predictor.label}
                </div>
                <div className="text-xs text-muted-foreground capitalize">
                  {predictor.type} {predictor.count && `• ${predictor.count} items`}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
