import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ContratosService } from '../../core/contratos.service';
import { ProveedoresService } from '../../core/proveedores.service';
import { Proveedor, Contrato, Sector } from '../../core/models';

@Component({
  selector: 'app-contrato-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="d-flex align-items-center mb-4">
      <a routerLink="/contratos" class="btn btn-outline-secondary btn-sm me-3">
        <i class="bi bi-arrow-left"></i>
      </a>
      <h3 class="mb-0">
        <i class="bi bi-journal-text me-2 text-primary"></i>
        {{ esNuevo ? 'Nuevo contrato' : 'Editar contrato' }}
      </h3>
    </div>

    @if (error()) {
      <div class="alert alert-danger">{{ error() }}</div>
    }

    <form (ngSubmit)="guardar()" class="card border-0 shadow-sm">
      <div class="card-body">
        <div class="row g-3">
          <div class="col-md-4">
            <label class="form-label small fw-semibold">N° de contrato</label>
            <input class="form-control bg-light" name="numero" [ngModel]="modelo.numero" readonly
                   placeholder="Se generará automáticamente" />
          </div>
          <div class="col-md-8">
            <label class="form-label small fw-semibold">Título *</label>
            <input class="form-control" name="titulo" [(ngModel)]="modelo.titulo" required />
          </div>

          <div class="col-md-6">
            <label class="form-label small fw-semibold">Proveedor *</label>
            <select class="form-select" name="proveedor_id" [(ngModel)]="modelo.proveedor_id" required>
              <option [ngValue]="undefined" disabled>Seleccione...</option>
              @for (pr of proveedores(); track pr.id) {
                <option [ngValue]="pr.id">{{ pr.razon_social }}</option>
              }
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label small fw-semibold">Sector *</label>
            <select class="form-select" name="sector_id" [(ngModel)]="modelo.sector_id" required>
              <option [ngValue]="undefined" disabled>Seleccione...</option>
              @for (s of sectores(); track s.id) {
                <option [ngValue]="s.id">{{ s.nombre }}</option>
              }
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label small fw-semibold">Tipo</label>
            <select class="form-select" name="tipo" [(ngModel)]="modelo.tipo">
              <option value="servicio">Servicio</option>
              <option value="suministro">Suministro</option>
              <option value="arrendamiento">Arrendamiento</option>
              <option value="distribucion">Distribución</option>
              <option value="confidencialidad">Confidencialidad</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label small fw-semibold">Estado</label>
            <select class="form-select" name="estado" [(ngModel)]="modelo.estado">
              <option value="borrador">Borrador</option>
              <option value="activo">Activo</option>
              <option value="vencido">Vencido</option>
              <option value="cancelado">Cancelado</option>
              <option value="renovado">Renovado</option>
            </select>
          </div>

          <div class="col-md-4">
            <label class="form-label small fw-semibold">Monto</label>
            <input type="number" step="0.01" class="form-control" name="monto" [(ngModel)]="modelo.monto" />
          </div>
          <div class="col-md-2">
            <label class="form-label small fw-semibold">Moneda</label>
            <select class="form-select" name="moneda" [(ngModel)]="modelo.moneda">
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="$">$</option>
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label small fw-semibold">Fecha inicio *</label>
            <input type="date" class="form-control" name="fecha_inicio" [(ngModel)]="modelo.fecha_inicio" required />
          </div>
          <div class="col-md-3">
            <label class="form-label small fw-semibold">Fecha fin *</label>
            <input type="date" class="form-control" name="fecha_fin" [(ngModel)]="modelo.fecha_fin" required />
          </div>

          <div class="col-md-6">
            <label class="form-label small fw-semibold">Responsable</label>
            <input class="form-control" name="responsable" [(ngModel)]="modelo.responsable" />
          </div>
          <div class="col-12">
            <label class="form-label small fw-semibold">Descripción</label>
            <textarea class="form-control" rows="3" name="descripcion" [(ngModel)]="modelo.descripcion"></textarea>
          </div>

          <!-- PDF del contrato -->
          <div class="col-12">
            <label class="form-label small fw-semibold">
              <i class="bi bi-file-earmark-pdf text-danger me-1"></i>Documento PDF del contrato *
            </label>
            @if (modelo.archivo_nombre) {
              <div class="d-flex align-items-center gap-2 mb-2">
                <span class="badge bg-light text-dark border">
                  <i class="bi bi-file-earmark-pdf text-danger me-1"></i>{{ modelo.archivo_nombre }}
                </span>
                <button type="button" class="btn btn-sm btn-outline-primary" (click)="descargarPdf()">
                  <i class="bi bi-download me-1"></i>Descargar
                </button>
                <button type="button" class="btn btn-sm btn-outline-danger" (click)="quitarPdf()">
                  <i class="bi bi-trash me-1"></i>Quitar
                </button>
              </div>
            }
            <input type="file" class="form-control" accept="application/pdf" (change)="onArchivo($event)"
                   [required]="!modelo.archivo_nombre" />
            <div class="form-text">
              Solo PDF, máximo 15 MB. El PDF es obligatorio.
              @if (esNuevo) { Se subirá al guardar el contrato. }
              @else if (archivo) { <span class="text-primary">Se reemplazará al guardar.</span> }
            </div>
          </div>
        </div>
      </div>
      <div class="card-footer bg-white text-end">
        <a routerLink="/contratos" class="btn btn-outline-secondary me-2">Cancelar</a>
        <button type="submit" class="btn btn-primary" [disabled]="guardando()">
          @if (guardando()) { <span class="spinner-border spinner-border-sm me-1"></span> }
          <i class="bi bi-check-lg me-1"></i>Guardar
        </button>
      </div>
    </form>

    <!-- Modal: número de contrato asignado -->
    @if (numeroAsignado()) {
      <div class="modal d-block" tabindex="-1" style="background: rgba(0,0,0,.5);">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">
                <i class="bi bi-check-circle-fill text-success me-2"></i>Contrato guardado
              </h5>
            </div>
            <div class="modal-body text-center py-4">
              <p class="mb-1 text-muted">Se asignó el siguiente número de contrato:</p>
              <div class="display-6 fw-bold text-primary">{{ numeroAsignado() }}</div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-primary px-4" (click)="aceptar()">
                <i class="bi bi-check-lg me-1"></i>Aceptar
              </button>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class ContratoFormComponent implements OnInit {
  esNuevo = true;
  id?: number;
  proveedores = signal<Proveedor[]>([]);
  sectores = signal<Sector[]>([]);
  guardando = signal(false);
  error = signal('');
  numeroAsignado = signal('');
  archivo: File | null = null;

  modelo: Partial<Contrato> = {
    numero: '',
    titulo: '',
    tipo: 'servicio',
    estado: 'borrador',
    monto: 0,
    moneda: 'USD',
    fecha_inicio: '',
    fecha_fin: '',
  };

  constructor(
    private service: ContratosService,
    private proveedoresSrv: ProveedoresService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.proveedoresSrv
      .listar()
      .subscribe((c) => this.proveedores.set(c.filter((p) => p.activo === true || p.activo === 1)));
    this.service.listarSectores().subscribe((s) => this.sectores.set(s));
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.esNuevo = false;
      this.id = Number(idParam);
      this.service.obtener(this.id).subscribe((c) => {
        this.modelo = {
          ...c,
          fecha_inicio: c.fecha_inicio?.substring(0, 10),
          fecha_fin: c.fecha_fin?.substring(0, 10),
        };
      });
    }
  }

  onArchivo(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.archivo = input.files && input.files.length ? input.files[0] : null;
  }

  guardar(): void {
    this.error.set('');
    if (this.modelo.sector_id == null) {
      this.error.set('Debe seleccionar un sector');
      return;
    }
    if (!this.archivo && !this.modelo.archivo_nombre) {
      this.error.set('Debe adjuntar el PDF del contrato');
      return;
    }
    this.guardando.set(true);
    const req = this.esNuevo
      ? this.service.crear(this.modelo)
      : this.service.actualizar(this.id!, this.modelo);
    req.subscribe({
      next: (contrato) => {
        const finalizar = () => {
          this.guardando.set(false);
          if (this.esNuevo) {
            this.numeroAsignado.set(contrato.numero);
          } else {
            this.router.navigate(['/contratos']);
          }
        };
        if (this.archivo) {
          this.service.subirArchivo(contrato.id, this.archivo).subscribe({
            next: () => finalizar(),
            error: (err) => {
              this.error.set(err.error?.error || 'El contrato se guardó, pero falló la subida del PDF');
              this.guardando.set(false);
            },
          });
        } else {
          finalizar();
        }
      },
      error: (err) => {
        this.error.set(err.error?.error || 'Error al guardar el contrato');
        this.guardando.set(false);
      },
    });
  }

  aceptar(): void {
    this.numeroAsignado.set('');
    this.router.navigate(['/contratos']);
  }

  descargarPdf(): void {
    if (!this.id) return;
    this.service.descargarArchivo(this.id).subscribe((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = this.modelo.archivo_nombre || `contrato-${this.modelo.numero}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  quitarPdf(): void {
    if (!this.id || !confirm('¿Quitar el PDF adjunto de este contrato?')) return;
    this.service.eliminarArchivo(this.id).subscribe((c) => {
      this.modelo.archivo_nombre = c.archivo_nombre;
      this.modelo.archivo_ruta = c.archivo_ruta;
    });
  }
}
