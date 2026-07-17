import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ContratosService } from '../../core/contratos.service';
import { Sector } from '../../core/models';

@Component({
  selector: 'app-sectores-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h3 class="mb-0"><i class="bi bi-diagram-3 me-2 text-primary"></i>Sectores</h3>
    </div>

    @if (error()) {
      <div class="alert alert-danger">{{ error() }}</div>
    }

    <div class="card border-0 shadow-sm mb-3">
      <div class="card-body">
        <form class="row g-2" (ngSubmit)="guardar()">
          <div class="col-md-8">
            <input
              class="form-control"
              name="nombre"
              [(ngModel)]="form.nombre"
              placeholder="Ej. Mantenimiento, Sistemas, etc."
              required
            />
          </div>
          <div class="col-md-2 d-grid">
            <button class="btn btn-primary" [disabled]="guardando()">
              @if (guardando()) {
                <span class="spinner-border spinner-border-sm me-1"></span>
              }
              {{ editando ? 'Actualizar' : 'Agregar' }}
            </button>
          </div>
          <div class="col-md-2 d-grid">
            <button type="button" class="btn btn-outline-secondary" (click)="cancelar()" [disabled]="guardando()">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>

    <div class="card border-0 shadow-sm">
      <div class="card-body p-0">
        @if (cargando()) {
          <div class="text-center py-5"><div class="spinner-border text-primary"></div></div>
        } @else if (sectores().length === 0) {
          <p class="text-muted text-center py-5 mb-0">No hay sectores registrados.</p>
        } @else {
          <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
              <thead class="table-light">
                <tr>
                  <th>Nombre</th>
                  <th class="text-end">Acciones</th>
                </tr>
              </thead>
              <tbody>
                @for (sector of sectores(); track sector.id) {
                  <tr>
                    <td>{{ sector.nombre }}</td>
                    <td class="text-end text-nowrap">
                      <button class="btn btn-sm btn-outline-primary" (click)="editar(sector)">
                        <i class="bi bi-pencil"></i>
                      </button>
                      <button class="btn btn-sm btn-outline-danger ms-1" (click)="eliminar(sector)">
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
export class SectoresListComponent implements OnInit {
  sectores = signal<Sector[]>([]);
  cargando = signal(false);
  guardando = signal(false);
  error = signal('');
  editando = false;
  form: Partial<Sector> = { nombre: '' };

  constructor(private service: ContratosService) {}

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    this.service.listarSectores().subscribe({
      next: (data) => {
        this.sectores.set(data);
        this.cargando.set(false);
      },
      error: () => {
        this.error.set('No se pudieron cargar los sectores');
        this.cargando.set(false);
      },
    });
  }

  guardar(): void {
    const nombre = (this.form.nombre || '').trim();
    if (!nombre) {
      this.error.set('El nombre del sector es obligatorio');
      return;
    }

    this.error.set('');
    this.guardando.set(true);

    const request = this.editando && this.form.id
      ? this.service.actualizarSector(this.form.id, { nombre })
      : this.service.crearSector({ nombre });

    request.subscribe({
      next: () => {
        this.cancelar();
        this.cargar();
      },
      error: (err) => {
        this.error.set(err.error?.error || 'No se pudo guardar el sector');
        this.guardando.set(false);
      },
    });
  }

  editar(sector: Sector): void {
    this.editando = true;
    this.form = { id: sector.id, nombre: sector.nombre };
  }

  cancelar(): void {
    this.editando = false;
    this.form = { nombre: '' };
    this.guardando.set(false);
  }

  eliminar(sector: Sector): void {
    if (!confirm(`¿Eliminar el sector ${sector.nombre}?`)) return;
    this.service.eliminarSector(sector.id).subscribe({
      next: () => this.cargar(),
      error: (err) => this.error.set(err.error?.error || 'No se pudo eliminar el sector'),
    });
  }
}
