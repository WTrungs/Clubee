import type { Department } from '../model/orgTypes'
import { DepartmentNode } from './DepartmentNode'

const COLUMNS = 2

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size))
}

interface OrgChartProps {
  departments: Department[]
  selectedId: string | null
  onSelect: (departmentId: string) => void
}

/** Nhánh của sơ đồ ở màn rộng, nối từ khối CLB ngay phía trên; đường nối chỉ để trang trí (FR-ORG-07). */
export function OrgChart({ departments, selectedId, onSelect }: OrgChartProps) {
  const rows = chunk(departments, COLUMNS)
  return (
    <div role="list" aria-label="Ban chuyên môn">
      {rows.map((row, index) => (
        // Trục dọc chạy qua khe giữa hai ban của mỗi hàng; hàng cuối lẻ thì ban nằm giữa, nối thẳng vào trục.
        <div key={row[0]?.id ?? index} className="relative pt-12">
          <span aria-hidden className="absolute top-0 left-1/2 h-6 w-px -translate-x-1/2 bg-border" />
          {index < rows.length - 1 && <span aria-hidden className="absolute top-6 bottom-0 left-1/2 w-px -translate-x-1/2 bg-border" />}
          {row.length > 1 && <span aria-hidden className="absolute top-6 right-[calc(25%-0.25rem)] left-[calc(25%-0.25rem)] h-px bg-border" />}
          <div className="flex justify-center gap-4">
            {row.map((department) => (
              <div key={department.id} role="listitem" className="relative flex min-w-0 basis-[calc(50%-0.5rem)]">
                <span aria-hidden className="absolute -top-6 left-1/2 h-6 w-px -translate-x-1/2 bg-border" />
                <DepartmentNode department={department} selected={selectedId === department.id} onSelect={() => onSelect(department.id)} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
