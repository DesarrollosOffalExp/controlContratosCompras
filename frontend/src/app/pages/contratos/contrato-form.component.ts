import { Component, OnInit, signal, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ContratosService } from '../../core/contratos.service';
import { ProveedoresService } from '../../core/proveedores.service';
import { Proveedor, Contrato, Sector, Adjunto } from '../../core/models';

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

          <!-- Adjuntos del contrato (varios) -->
          <div class="col-12">
            <label class="form-label small fw-semibold">
              <i class="bi bi-paperclip me-1"></i>Adjuntos del contrato *
            </label>

            <!-- Ya guardados (modo edición) -->
            @if (modelo.adjuntos?.length) {
              <ul class="list-group mb-2">
                @for (a of modelo.adjuntos; track a.id) {
                  <li class="list-group-item d-flex align-items-center justify-content-between">
                    <span class="text-truncate me-2">
                      <i class="bi bi-file-earmark-text text-primary me-2"></i>{{ a.archivo_nombre }}
                      <small class="text-muted ms-1">{{ tamano(a.tamano) }}</small>
                    </span>
                    <span class="btn-group btn-group-sm flex-shrink-0">
                      <button type="button" class="btn btn-outline-primary" title="Descargar"
                              (click)="descargar(a)"><i class="bi bi-download"></i></button>
                      <button type="button" class="btn btn-outline-danger" title="Quitar"
                              (click)="quitar(a)"><i class="bi bi-trash"></i></button>
                    </span>
                  </li>
                }
              </ul>
            }

            <!-- Nuevos, pendientes de subir -->
            @if (nuevos.length) {
              <ul class="list-group mb-2">
                @for (f of nuevos; track f.name; let i = $index) {
                  <li class="list-group-item d-flex align-items-center justify-content-between">
                    <span class="text-truncate me-2">
                      <i class="bi bi-file-earmark-plus text-success me-2"></i>{{ f.name }}
                      <small class="text-muted ms-1">{{ tamano(f.size) }}</small>
                    </span>
                    <button type="button" class="btn btn-sm btn-outline-secondary flex-shrink-0"
                            title="Quitar de la selección" (click)="quitarNuevo(i)">
                      <i class="bi bi-x-lg"></i>
                    </button>
                  </li>
                }
              </ul>
            }

            <input #fileInput type="file" class="form-control" multiple
                   accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx" (change)="onArchivos($event)" />
            <div class="form-text">
              PDF, imágenes o documentos. Podés seleccionar varios. Máximo 15 MB cada uno.
              @if (esNuevo) { Se subirán al guardar el contrato. }
              @else { Los nuevos se agregan al guardar; los ya cargados no se pisan. }
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
  nuevos: File[] = [];
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

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

  onArchivos(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.nuevos = [...this.nuevos, ...Array.from(input.files)];
    }
    // Se limpia el input para poder volver a elegir el mismo archivo si hiciera falta.
    if (this.fileInput) this.fileInput.nativeElement.value = '';
  }

  quitarNuevo(i: number): void {
    this.nuevos.splice(i, 1);
  }

  tieneAdjuntos(): boolean {
    return (this.modelo.adjuntos?.length ?? 0) > 0 || this.nuevos.length > 0;
  }

  tamano(bytes?: number): string {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  guardar(): void {
    this.error.set('');
    if (this.modelo.sector_id == null) {
      this.error.set('Debe seleccionar un sector');
      return;
    }
    if (!this.tieneAdjuntos()) {
      this.error.set('Debe adjuntar al menos un archivo');
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
        if (this.nuevos.length) {
          this.service.subirAdjuntos(contrato.id, this.nuevos).subscribe({
            next: () => finalizar(),
            error: (err) => {
              this.error.set(err.error?.error || 'El contrato se guardó, pero falló la subida de los adjuntos');
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

  descargar(a: Adjunto): void {
    if (!this.id) return;
    this.service.descargarAdjunto(this.id, a.id).subscribe((blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = a.archivo_nombre || 'adjunto';
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  quitar(a: Adjunto): void {
    if (!this.id || !confirm(`¿Quitar "${a.archivo_nombre}" de este contrato?`)) return;
    this.service.eliminarAdjunto(this.id, a.id).subscribe((c) => {
      this.modelo.adjuntos = c.adjuntos;
    });
  }
}
