export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  rol: 'admin' | 'gestor' | 'lector';
}

export interface Proveedor {
  id: number;
  razon_social: string;
  contacto?: string;
  email?: string;
  telefono?: string;
  direccion?: string;
  activo?: boolean | number;
  created_at?: string;
}

export type EstadoContrato = 'borrador' | 'activo' | 'vencido' | 'cancelado' | 'renovado';
export type TipoContrato =
  | 'servicio' | 'suministro' | 'arrendamiento' | 'distribucion' | 'confidencialidad' | 'otro';

export interface Sector {
  id: number;
  nombre: string;
  activo?: boolean;
  created_at?: string;
}

export interface Contrato {
  id: number;
  numero: string;
  titulo: string;
  descripcion?: string;
  proveedor_id: number;
  proveedor_nombre?: string;
  sector_id?: number | null;
  sector_nombre?: string;
  tipo: TipoContrato;
  monto: number;
  moneda: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: EstadoContrato;
  responsable?: string;
  archivo_nombre?: string | null;
  archivo_ruta?: string | null;
  dias_restantes?: number;
  created_at?: string;
  updated_at?: string;
}

export interface DashboardData {
  totales: {
    total: number;
    activos: number | string;
    borradores: number | string;
    vencidos: number | string;
    cancelados: number | string;
  };
  montos_por_moneda: { moneda: string; total: string }[];
  por_sector: { sector: string; cantidad: number }[];
  por_vencer_30d: number;
  requieren_atencion: number;
}
