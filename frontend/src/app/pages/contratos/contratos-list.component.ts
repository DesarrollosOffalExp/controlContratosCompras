import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ContratosService, FiltroContratos } from '../../core/contratos.service';
import { Contrato, Sector } from '../../core/models';

@Component({
  selector: 'app-contratos-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h3 class="mb-0"><i class="bi bi-journal-text me-2 text-primary"></i>Contratos</h3>
      <a routerLink="/contratos/nuevo" class="btn btn-primary">
        <i class="bi bi-plus-lg me-1"></i>Nuevo
      </a>
    </div>

    <!-- Filtros -->
    <div class="card border-0 shadow-sm mb-3">
      <div class="card-body">
        <div class="row g-2">
          <div class="col-md-4">
            <div class="input-group">
              <span class="input-group-text"><i class="bi bi-search"></i></span>
              <input class="form-control" placeholder="Buscar por N°, título o proveedor..."
                     [(ngModel)]="filtro.buscar" (keyup.enter)="cargar()" />
            </div>
          </div>
          <div class="col-md-3">
            <select class="form-select" [(ngModel)]="filtro.estado" (change)="cargar()">
              <option value="">Todos los estados</option>
              <option value="borrador">Borrador</option>
              <option value="activo">Activo</option>
              <option value="vencido">Vencido</option>
              <option value="cancelado">Cancelado</option>
              <option value="renovado">Renovado</option>
            </select>
          </div>
          <div class="col-md-3">
            <select class="form-select" [(ngModel)]="filtro.tipo" (change)="cargar()">
              <option value="">Todos los tipos</option>
              <option value="servicio">Servicio</option>
              <option value="suministro">Suministro</option>
              <option value="arrendamiento">Arrendamiento</option>
              <option value="distribucion">Distribución</option>
              <option value="confidencialidad">Confidencialidad</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          <div class="col-md-2 d-grid">
            <button class="btn btn-outline-secondary" (click)="limpiar()">
              <i class="bi bi-arrow-counterclockwise me-1"></i>Limpiar
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="card border-0 shadow-sm">
      <div class="card-body p-0">
        @if (cargando()) {
          <div class="text-center py-5"><div class="spinner-border text-primary"></div></div>
        } @else if (contratos().length === 0) {
          <p class="text-muted text-center py-5 mb-0">No se encontraron contratos.</p>
        } @else {
          <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
              <thead class="table-light">
                <tr>
                  <th>N°</th><th>Título</th><th>Proveedor</th><th>Sector</th><th>Tipo</th>
                  <th class="text-end">Monto</th><th>Vigencia</th><th>PDF</th><th>Estado</th><th></th>
                </tr>
              </thead>
              <tbody>
                @for (c of contratos(); track c.id) {
                  <tr [class.table-warning]="esPorVencer(c)" [class.table-danger]="esVencido(c)">
                    <td class="fw-semibold">{{ c.numero }}</td>
                    <td>
                      {{ c.titulo }}
                      @if (esPorVencer(c)) {
                        <i class="bi bi-exclamation-triangle-fill text-warning ms-1"
                           title="Vence en {{ c.dias_restantes }} días"></i>
                      }
                    </td>
                    <td class="small">{{ c.proveedor_nombre }}</td>
                    <td class="small">{{ c.sector_nombre || '—' }}</td>
                    <td><span class="badge bg-light text-dark text-capitalize">{{ c.tipo }}</span></td>
                    <td class="text-end">{{ c.monto | number: '1.2-2' }} {{ c.moneda }}</td>
                    <td class="small">
                      {{ c.fecha_inicio | date: 'dd/MM/yy' }} –
                      {{ c.fecha_fin | date: 'dd/MM/yy' }}
                    </td>
                    <td class="text-center">
                      @if (c.archivo_nombre) {
                        <button class="btn btn-sm btn-outline-danger" title="Descargar {{ c.archivo_nombre }}"
                                (click)="descargarPdf(c)">
                          <i class="bi bi-file-earmark-pdf"></i>
                        </button>
                      } @else {
                        <span class="text-muted">—</span>
                      }
                    </td>
                    <td><span class="badge" [ngClass]="badgeEstado(c.estado)">{{ c.estado }}</span></td>
                    <td class="text-end text-nowrap">
                      <a [routerLink]="['/contratos', c.id]" class="btn btn-sm btn-outline-primary">
                        <i class="bi bi-pencil"></i>
                      </a>
                      <button class="btn btn-sm btn-outline-danger ms-1" (click)="eliminar(c)">
                        <i class="bi bi-trash"></i>
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </div>
  `,
})
export class ContratosListComponent implements OnInit {
  contratos = signal<Contrato[]>([]);
  sectores = signal<Sector[]>([]);
  cargando = signal(false);
  filtro: FiltroContratos = { buscar: '', estado: '', tipo: '' };

  constructor(private service: ContratosService) {}

  ngOnInit(): void {
    this.cargar();
    this.service.listarSectores().subscribe((s) => this.sectores.set(s));
  }

  cargar(): void {
    this.cargando.set(true);
    this.service.listar(this.filtro).subscribe({
      next: (c) => {
        this.contratos.set(c);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }

  limpiar(): void {
    this.filtro = { buscar: '', estado: '', tipo: '' };
    this.cargar();
  }

  eliminar(c: Contrato): void {
    if (!confirm(`¿Eliminar el contrato ${c.numero}?`)) return;
    this.service.eliminar(c.id).subscribe(() => this.cargar());
  }

  descargarPdf(c: Contrato): void {
    this.service.descargarArchivo(c.id).subscribe((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = c.archivo_nombre || `contrato-${c.numero}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  esPorVencer(c: Contrato): boolean {
    return c.estado === 'activo' && c.dias_restantes != null && c.dias_restantes >= 0 && c.dias_restantes <= 30;
  }

  esVencido(c: Contrato): boolean {
    return c.estado === 'vencido' || (c.estado === 'activo' && c.dias_restantes != null && c.dias_restantes < 0);
  }

  badgeEstado(estado: string): string {
    return {
      activo: 'bg-success',
      borrador: 'bg-secondary',
      vencido: 'bg-danger',
      cancelado: 'bg-dark',
      renovado: 'bg-info text-dark',
    }[estado] || 'bg-secondary';
  }
}
