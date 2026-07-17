import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProveedoresService } from '../../core/proveedores.service';
import { Proveedor } from '../../core/models';

@Component({
  selector: 'app-proveedores-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h3 class="mb-0"><i class="bi bi-people me-2 text-primary"></i>Proveedores</h3>
      <div class="d-flex align-items-center gap-3">
        <div class="form-check form-switch mb-0">
          <input class="form-check-input" type="checkbox" id="verInactivos"
                 [(ngModel)]="mostrarInactivos" />
          <label class="form-check-label small" for="verInactivos">Mostrar inactivos</label>
        </div>
        <button class="btn btn-primary" (click)="nuevo()">
          <i class="bi bi-plus-lg me-1"></i>Nuevo proveedor
        </button>
      </div>
    </div>

    <div class="card border-0 shadow-sm">
      <div class="card-body p-0">
        @if (visibles().length === 0) {
          <p class="text-muted text-center py-5 mb-0">No hay proveedores para mostrar.</p>
        } @else {
          <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
              <thead class="table-light">
                <tr><th>Razón social</th><th>Contacto</th><th>Email</th><th>Teléfono</th><th>Estado</th><th></th></tr>
              </thead>
              <tbody>
                @for (c of visibles(); track c.id) {
                  <tr [class.table-warning]="!esActivo(c)">
                    <td class="fw-semibold">{{ c.razon_social }}</td>
                    <td class="small">{{ c.contacto || '—' }}</td>
                    <td class="small">{{ c.email || '—' }}</td>
                    <td class="small">{{ c.telefono || '—' }}</td>
                    <td>
                      @if (esActivo(c)) {
                        <span class="badge bg-success">Activo</span>
                      } @else {
                        <span class="badge bg-secondary">Inactivo</span>
                      }
                    </td>
                    <td class="text-end">
                      <button class="btn btn-sm btn-outline-primary" (click)="editar(c)">
                        <i class="bi bi-pencil"></i>
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

    <!-- Modal de edición -->
    @if (editando()) {
      <div class="modal d-block" tabindex="-1" style="background: rgba(0,0,0,.5);">
        <div class="modal-dialog">
          <div class="modal-content">
            <form (ngSubmit)="guardar()">
              <div class="modal-header">
                <h5 class="modal-title">{{ modelo.id ? 'Editar' : 'Nuevo' }} proveedor</h5>
                <button type="button" class="btn-close" (click)="cerrar()"></button>
              </div>
              <div class="modal-body">
                @if (error()) { <div class="alert alert-danger py-2 small">{{ error() }}</div> }
                <div class="mb-3">
                  <label class="form-label small fw-semibold">Razón social *</label>
                  <input class="form-control" name="razon_social" [(ngModel)]="modelo.razon_social" required />
                </div>
                <div class="row g-2">
                  <div class="col-6">
                    <label class="form-label small fw-semibold">Contacto</label>
                    <input class="form-control" name="contacto" [(ngModel)]="modelo.contacto" />
                  </div>
                  <div class="col-6">
                    <label class="form-label small fw-semibold">Teléfono</label>
                    <input class="form-control" name="telefono" [(ngModel)]="modelo.telefono" />
                  </div>
                </div>
                <div class="mb-3 mt-2">
                  <label class="form-label small fw-semibold">Email</label>
                  <input type="email" class="form-control" name="email" [(ngModel)]="modelo.email" />
                </div>
                <div class="mb-3">
                  <label class="form-label small fw-semibold">Dirección</label>
                  <input class="form-control" name="direccion" [(ngModel)]="modelo.direccion" />
                </div>
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" id="activoCheck"
                         name="activo" [(ngModel)]="modelo.activo" />
                  <label class="form-check-label small fw-semibold" for="activoCheck">Proveedor activo</label>
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" (click)="cerrar()">Cancelar</button>
                <button type="submit" class="btn btn-primary">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    }
  `,
})
export class ProveedoresListComponent implements OnInit {
  proveedores = signal<Proveedor[]>([]);
  mostrarInactivos = signal(false);
  editando = signal(false);
  error = signal('');
  modelo: Partial<Proveedor> = {};

  visibles = computed(() =>
    this.mostrarInactivos()
      ? this.proveedores()
      : this.proveedores().filter((p) => this.esActivo(p))
  );

  constructor(private service: ProveedoresService) {}

  ngOnInit(): void {
    this.cargar();
  }

  esActivo(p: Proveedor): boolean {
    return p.activo === true || p.activo === 1;
  }

  cargar(): void {
    this.service.listar().subscribe((c) => this.proveedores.set(c));
  }

  nuevo(): void {
    this.modelo = { activo: true };
    this.error.set('');
    this.editando.set(true);
  }

  editar(c: Proveedor): void {
    this.modelo = { ...c, activo: this.esActivo(c) };
    this.error.set('');
    this.editando.set(true);
  }

  cerrar(): void {
    this.editando.set(false);
  }

  guardar(): void {
    this.error.set('');
    const req = this.modelo.id
      ? this.service.actualizar(this.modelo.id, this.modelo)
      : this.service.crear(this.modelo);
    req.subscribe({
      next: () => {
        this.editando.set(false);
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.error || 'Error al guardar'),
    });
  }
}
