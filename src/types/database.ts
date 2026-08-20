// Generated from the Supabase schema — do not edit by hand.
//
// Regenerate after every schema change (see CONTRIBUTING.md):
//   the Supabase MCP `generate_typescript_types`, or
//   npx supabase gen types typescript --project-id <ref> > types/database.ts
//
// Excluded from Prettier and ESLint on purpose: it is generated output.
//
// Note: solicitudes_compra, solicitud_opciones and solicitud_enlaces exist in
// the live database but are absent from supabase/schema.sql and referenced by no
// code in this repo. They are reproduced here because this file mirrors the real
// schema; see docs/architecture.md.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      caja_movimientos: {
        Row: {
          comprador: string | null;
          concepto: string;
          created_at: string;
          fecha: string;
          id: string;
          monto: number;
          notas: string | null;
          tipo: string;
        };
        Insert: {
          comprador?: string | null;
          concepto: string;
          created_at?: string;
          fecha: string;
          id?: string;
          monto: number;
          notas?: string | null;
          tipo: string;
        };
        Update: {
          comprador?: string | null;
          concepto?: string;
          created_at?: string;
          fecha?: string;
          id?: string;
          monto?: number;
          notas?: string | null;
          tipo?: string;
        };
        Relationships: [];
      };
      campos_inventario: {
        Row: {
          activo: boolean;
          categoria: string;
          clave: string;
          created_at: string;
          etiqueta: string;
          id: string;
          opciones: Json;
          orden: number;
          placeholder: string | null;
          requerido: boolean;
          tipo: string;
        };
        Insert: {
          activo?: boolean;
          categoria: string;
          clave: string;
          created_at?: string;
          etiqueta: string;
          id?: string;
          opciones?: Json;
          orden?: number;
          placeholder?: string | null;
          requerido?: boolean;
          tipo?: string;
        };
        Update: {
          activo?: boolean;
          categoria?: string;
          clave?: string;
          created_at?: string;
          etiqueta?: string;
          id?: string;
          opciones?: Json;
          orden?: number;
          placeholder?: string | null;
          requerido?: boolean;
          tipo?: string;
        };
        Relationships: [];
      };
      config_correo: {
        Row: {
          activo: boolean;
          asunto_estado: string;
          asunto_nuevo: string;
          asunto_respuesta: string;
          azure_client_id: string | null;
          azure_client_secret: string | null;
          azure_tenant_id: string | null;
          caja_limite: number | null;
          cuerpo_estado: string;
          cuerpo_nuevo: string;
          cuerpo_respuesta: string;
          firma_direccion: string | null;
          firma_eslogan: string | null;
          firma_web: string | null;
          id: number;
          metodo: string;
          notif_estado_def: boolean;
          notif_nuevo: boolean;
          notif_nuevo_destinos: string | null;
          notif_respuesta_def: boolean;
          oauth_cuenta: string | null;
          oauth_refresh_token: string | null;
          remitente: string | null;
          remitente_nombre: string;
          sitio_url: string | null;
          sla_alta_resolucion: number | null;
          sla_alta_respuesta: number | null;
          sla_baja_resolucion: number | null;
          sla_baja_respuesta: number | null;
          sla_critica_resolucion: number | null;
          sla_critica_respuesta: number | null;
          sla_media_resolucion: number | null;
          sla_media_respuesta: number | null;
          sla_por_vencer_pct: number;
          smtp_host: string;
          smtp_pass: string | null;
          smtp_port: number;
          smtp_user: string | null;
          updated_at: string;
        };
        Insert: {
          activo?: boolean;
          asunto_estado?: string;
          asunto_nuevo?: string;
          asunto_respuesta?: string;
          azure_client_id?: string | null;
          azure_client_secret?: string | null;
          azure_tenant_id?: string | null;
          caja_limite?: number | null;
          cuerpo_estado?: string;
          cuerpo_nuevo?: string;
          cuerpo_respuesta?: string;
          firma_direccion?: string | null;
          firma_eslogan?: string | null;
          firma_web?: string | null;
          id?: number;
          metodo?: string;
          notif_estado_def?: boolean;
          notif_nuevo?: boolean;
          notif_nuevo_destinos?: string | null;
          notif_respuesta_def?: boolean;
          oauth_cuenta?: string | null;
          oauth_refresh_token?: string | null;
          remitente?: string | null;
          remitente_nombre?: string;
          sitio_url?: string | null;
          sla_alta_resolucion?: number | null;
          sla_alta_respuesta?: number | null;
          sla_baja_resolucion?: number | null;
          sla_baja_respuesta?: number | null;
          sla_critica_resolucion?: number | null;
          sla_critica_respuesta?: number | null;
          sla_media_resolucion?: number | null;
          sla_media_respuesta?: number | null;
          sla_por_vencer_pct?: number;
          smtp_host?: string;
          smtp_pass?: string | null;
          smtp_port?: number;
          smtp_user?: string | null;
          updated_at?: string;
        };
        Update: {
          activo?: boolean;
          asunto_estado?: string;
          asunto_nuevo?: string;
          asunto_respuesta?: string;
          azure_client_id?: string | null;
          azure_client_secret?: string | null;
          azure_tenant_id?: string | null;
          caja_limite?: number | null;
          cuerpo_estado?: string;
          cuerpo_nuevo?: string;
          cuerpo_respuesta?: string;
          firma_direccion?: string | null;
          firma_eslogan?: string | null;
          firma_web?: string | null;
          id?: number;
          metodo?: string;
          notif_estado_def?: boolean;
          notif_nuevo?: boolean;
          notif_nuevo_destinos?: string | null;
          notif_respuesta_def?: boolean;
          oauth_cuenta?: string | null;
          oauth_refresh_token?: string | null;
          remitente?: string | null;
          remitente_nombre?: string;
          sitio_url?: string | null;
          sla_alta_resolucion?: number | null;
          sla_alta_respuesta?: number | null;
          sla_baja_resolucion?: number | null;
          sla_baja_respuesta?: number | null;
          sla_critica_resolucion?: number | null;
          sla_critica_respuesta?: number | null;
          sla_media_resolucion?: number | null;
          sla_media_respuesta?: number | null;
          sla_por_vencer_pct?: number;
          smtp_host?: string;
          smtp_pass?: string | null;
          smtp_port?: number;
          smtp_user?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      empleados: {
        Row: {
          correo: string;
          created_at: string;
          departamento: string | null;
          estado: string;
          extension: string | null;
          id: string;
          nombre: string;
          puesto: string | null;
        };
        Insert: {
          correo: string;
          created_at?: string;
          departamento?: string | null;
          estado?: string;
          extension?: string | null;
          id?: string;
          nombre: string;
          puesto?: string | null;
        };
        Update: {
          correo?: string;
          created_at?: string;
          departamento?: string | null;
          estado?: string;
          extension?: string | null;
          id?: string;
          nombre?: string;
          puesto?: string | null;
        };
        Relationships: [];
      };
      equipos: {
        Row: {
          accesos: Json;
          asignado_a: string | null;
          asignado_email: string | null;
          categoria: string;
          created_at: string;
          estado: string;
          extras: Json;
          fecha_compra: string | null;
          garantia_hasta: string | null;
          id: string;
          marca: string | null;
          modelo: string | null;
          nombre: string;
          notas: string | null;
          num_serie: string | null;
          telefono: string | null;
          tipo: string;
          ubicacion: string | null;
        };
        Insert: {
          accesos?: Json;
          asignado_a?: string | null;
          asignado_email?: string | null;
          categoria?: string;
          created_at?: string;
          estado?: string;
          extras?: Json;
          fecha_compra?: string | null;
          garantia_hasta?: string | null;
          id?: string;
          marca?: string | null;
          modelo?: string | null;
          nombre: string;
          notas?: string | null;
          num_serie?: string | null;
          telefono?: string | null;
          tipo?: string;
          ubicacion?: string | null;
        };
        Update: {
          accesos?: Json;
          asignado_a?: string | null;
          asignado_email?: string | null;
          categoria?: string;
          created_at?: string;
          estado?: string;
          extras?: Json;
          fecha_compra?: string | null;
          garantia_hasta?: string | null;
          id?: string;
          marca?: string | null;
          modelo?: string | null;
          nombre?: string;
          notas?: string | null;
          num_serie?: string | null;
          telefono?: string | null;
          tipo?: string;
          ubicacion?: string | null;
        };
        Relationships: [];
      };
      facturas: {
        Row: {
          adjuntos: Json;
          concepto: string;
          created_at: string;
          estado: string;
          fecha_emision: string | null;
          fecha_pago: string | null;
          fecha_vencimiento: string;
          folio_proveedor: string | null;
          id: string;
          metodo_pago: string | null;
          moneda: string;
          monto: number;
          notas: string | null;
          num: number;
          proveedor_id: string | null;
          uuid_cfdi: string | null;
        };
        Insert: {
          adjuntos?: Json;
          concepto: string;
          created_at?: string;
          estado?: string;
          fecha_emision?: string | null;
          fecha_pago?: string | null;
          fecha_vencimiento: string;
          folio_proveedor?: string | null;
          id?: string;
          metodo_pago?: string | null;
          moneda?: string;
          monto?: number;
          notas?: string | null;
          num?: number;
          proveedor_id?: string | null;
          uuid_cfdi?: string | null;
        };
        Update: {
          adjuntos?: Json;
          concepto?: string;
          created_at?: string;
          estado?: string;
          fecha_emision?: string | null;
          fecha_pago?: string | null;
          fecha_vencimiento?: string;
          folio_proveedor?: string | null;
          id?: string;
          metodo_pago?: string | null;
          moneda?: string;
          monto?: number;
          notas?: string | null;
          num?: number;
          proveedor_id?: string | null;
          uuid_cfdi?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "facturas_proveedor_id_fkey";
            columns: ["proveedor_id"];
            isOneToOne: false;
            referencedRelation: "proveedores";
            referencedColumns: ["id"];
          },
        ];
      };
      incidentes: {
        Row: {
          created_at: string;
          descripcion: string | null;
          estado: string;
          fin: string | null;
          id: string;
          inicio: string;
          num: number;
          resolucion: string | null;
          servicio_id: string;
          tipo: string;
          titulo: string;
        };
        Insert: {
          created_at?: string;
          descripcion?: string | null;
          estado?: string;
          fin?: string | null;
          id?: string;
          inicio?: string;
          num?: number;
          resolucion?: string | null;
          servicio_id: string;
          tipo?: string;
          titulo: string;
        };
        Update: {
          created_at?: string;
          descripcion?: string | null;
          estado?: string;
          fin?: string | null;
          id?: string;
          inicio?: string;
          num?: number;
          resolucion?: string | null;
          servicio_id?: string;
          tipo?: string;
          titulo?: string;
        };
        Relationships: [
          {
            foreignKeyName: "incidentes_servicio_id_fkey";
            columns: ["servicio_id"];
            isOneToOne: false;
            referencedRelation: "servicios";
            referencedColumns: ["id"];
          },
        ];
      };
      mantenimientos: {
        Row: {
          created_at: string;
          equipo_id: string | null;
          estado: string;
          fecha_programada: string;
          id: string;
          notas: string | null;
          responsable: string | null;
          tipo: string;
          titulo: string;
        };
        Insert: {
          created_at?: string;
          equipo_id?: string | null;
          estado?: string;
          fecha_programada: string;
          id?: string;
          notas?: string | null;
          responsable?: string | null;
          tipo?: string;
          titulo: string;
        };
        Update: {
          created_at?: string;
          equipo_id?: string | null;
          estado?: string;
          fecha_programada?: string;
          id?: string;
          notas?: string | null;
          responsable?: string | null;
          tipo?: string;
          titulo?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mantenimientos_equipo_id_fkey";
            columns: ["equipo_id"];
            isOneToOne: false;
            referencedRelation: "equipos";
            referencedColumns: ["id"];
          },
        ];
      };
      plantillas_responsiva: {
        Row: {
          accesorios: Json;
          aviso: string | null;
          campos_equipo: Json | null;
          clausulas: Json;
          clave: string;
          codigo: string;
          firmas: Json;
          iso: string | null;
          nombre: string;
          prefijo_folio: string;
          seguridad: Json;
          titulo: string;
          updated_at: string;
          version: string;
        };
        Insert: {
          accesorios?: Json;
          aviso?: string | null;
          campos_equipo?: Json | null;
          clausulas?: Json;
          clave: string;
          codigo: string;
          firmas?: Json;
          iso?: string | null;
          nombre: string;
          prefijo_folio: string;
          seguridad?: Json;
          titulo: string;
          updated_at?: string;
          version?: string;
        };
        Update: {
          accesorios?: Json;
          aviso?: string | null;
          campos_equipo?: Json | null;
          clausulas?: Json;
          clave?: string;
          codigo?: string;
          firmas?: Json;
          iso?: string | null;
          nombre?: string;
          prefijo_folio?: string;
          seguridad?: Json;
          titulo?: string;
          updated_at?: string;
          version?: string;
        };
        Relationships: [];
      };
      proveedores: {
        Row: {
          activo: boolean;
          contacto: string | null;
          correo: string | null;
          costo: number | null;
          created_at: string;
          id: string;
          moneda: string;
          nombre: string;
          notas: string | null;
          periodicidad: string;
          proximo_pago: string | null;
          servicio: string | null;
          telefono: string | null;
        };
        Insert: {
          activo?: boolean;
          contacto?: string | null;
          correo?: string | null;
          costo?: number | null;
          created_at?: string;
          id?: string;
          moneda?: string;
          nombre: string;
          notas?: string | null;
          periodicidad?: string;
          proximo_pago?: string | null;
          servicio?: string | null;
          telefono?: string | null;
        };
        Update: {
          activo?: boolean;
          contacto?: string | null;
          correo?: string | null;
          costo?: number | null;
          created_at?: string;
          id?: string;
          moneda?: string;
          nombre?: string;
          notas?: string | null;
          periodicidad?: string;
          proximo_pago?: string | null;
          servicio?: string | null;
          telefono?: string | null;
        };
        Relationships: [];
      };
      proyectos: {
        Row: {
          created_at: string;
          descripcion: string | null;
          estado: string;
          fecha_objetivo: string | null;
          id: string;
          nombre: string;
        };
        Insert: {
          created_at?: string;
          descripcion?: string | null;
          estado?: string;
          fecha_objetivo?: string | null;
          id?: string;
          nombre: string;
        };
        Update: {
          created_at?: string;
          descripcion?: string | null;
          estado?: string;
          fecha_objetivo?: string | null;
          id?: string;
          nombre?: string;
        };
        Relationships: [];
      };
      responsivas: {
        Row: {
          archivo_nombre: string | null;
          archivo_url: string | null;
          created_at: string;
          datos: Json;
          empleado_correo: string | null;
          empleado_departamento: string | null;
          empleado_nombre: string | null;
          empleado_puesto: string | null;
          equipo_id: string | null;
          equipo_nombre: string | null;
          estado: string;
          fecha_entrega: string | null;
          fecha_firmada: string | null;
          fecha_generada: string;
          id: string;
          notas: string | null;
          num: number;
          personas: Json;
          plantilla: string;
        };
        Insert: {
          archivo_nombre?: string | null;
          archivo_url?: string | null;
          created_at?: string;
          datos?: Json;
          empleado_correo?: string | null;
          empleado_departamento?: string | null;
          empleado_nombre?: string | null;
          empleado_puesto?: string | null;
          equipo_id?: string | null;
          equipo_nombre?: string | null;
          estado?: string;
          fecha_entrega?: string | null;
          fecha_firmada?: string | null;
          fecha_generada?: string;
          id?: string;
          notas?: string | null;
          num?: number;
          personas?: Json;
          plantilla?: string;
        };
        Update: {
          archivo_nombre?: string | null;
          archivo_url?: string | null;
          created_at?: string;
          datos?: Json;
          empleado_correo?: string | null;
          empleado_departamento?: string | null;
          empleado_nombre?: string | null;
          empleado_puesto?: string | null;
          equipo_id?: string | null;
          equipo_nombre?: string | null;
          estado?: string;
          fecha_entrega?: string | null;
          fecha_firmada?: string | null;
          fecha_generada?: string;
          id?: string;
          notas?: string | null;
          num?: number;
          personas?: Json;
          plantilla?: string;
        };
        Relationships: [
          {
            foreignKeyName: "responsivas_equipo_id_fkey";
            columns: ["equipo_id"];
            isOneToOne: false;
            referencedRelation: "equipos";
            referencedColumns: ["id"];
          },
        ];
      };
      servicios: {
        Row: {
          activo: boolean;
          categoria: string;
          created_at: string;
          criticidad: string;
          descripcion: string | null;
          id: string;
          nombre: string;
          orden: number;
          proveedor: string | null;
          visible_portal: boolean;
        };
        Insert: {
          activo?: boolean;
          categoria?: string;
          created_at?: string;
          criticidad?: string;
          descripcion?: string | null;
          id?: string;
          nombre: string;
          orden?: number;
          proveedor?: string | null;
          visible_portal?: boolean;
        };
        Update: {
          activo?: boolean;
          categoria?: string;
          created_at?: string;
          criticidad?: string;
          descripcion?: string | null;
          id?: string;
          nombre?: string;
          orden?: number;
          proveedor?: string | null;
          visible_portal?: boolean;
        };
        Relationships: [];
      };
      solicitud_enlaces: {
        Row: {
          id: string;
          opcion_id: string;
          orden: number;
          tienda: string | null;
          url: string | null;
        };
        Insert: {
          id?: string;
          opcion_id: string;
          orden?: number;
          tienda?: string | null;
          url?: string | null;
        };
        Update: {
          id?: string;
          opcion_id?: string;
          orden?: number;
          tienda?: string | null;
          url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "solicitud_enlaces_opcion_id_fkey";
            columns: ["opcion_id"];
            isOneToOne: false;
            referencedRelation: "solicitud_opciones";
            referencedColumns: ["id"];
          },
        ];
      };
      solicitud_opciones: {
        Row: {
          contras: string | null;
          created_at: string;
          id: string;
          imagen_url: string | null;
          justificacion: string | null;
          moneda: string | null;
          nombre: string | null;
          orden: number;
          precio: number | null;
          pros: string | null;
          recomendado: boolean;
          solicitud_id: string;
        };
        Insert: {
          contras?: string | null;
          created_at?: string;
          id?: string;
          imagen_url?: string | null;
          justificacion?: string | null;
          moneda?: string | null;
          nombre?: string | null;
          orden?: number;
          precio?: number | null;
          pros?: string | null;
          recomendado?: boolean;
          solicitud_id: string;
        };
        Update: {
          contras?: string | null;
          created_at?: string;
          id?: string;
          imagen_url?: string | null;
          justificacion?: string | null;
          moneda?: string | null;
          nombre?: string | null;
          orden?: number;
          precio?: number | null;
          pros?: string | null;
          recomendado?: boolean;
          solicitud_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "solicitud_opciones_solicitud_id_fkey";
            columns: ["solicitud_id"];
            isOneToOne: false;
            referencedRelation: "solicitudes_compra";
            referencedColumns: ["id"];
          },
        ];
      };
      solicitudes_compra: {
        Row: {
          aprobo: string | null;
          centro_costos: string | null;
          contexto: string | null;
          created_at: string;
          dirigido_a: string | null;
          elaboro: string | null;
          estatus: string;
          fecha: string | null;
          folio: string | null;
          id: string;
          num: number;
          revision: string | null;
          reviso: string | null;
          solicitante: string | null;
          titulo: string;
          updated_at: string;
        };
        Insert: {
          aprobo?: string | null;
          centro_costos?: string | null;
          contexto?: string | null;
          created_at?: string;
          dirigido_a?: string | null;
          elaboro?: string | null;
          estatus?: string;
          fecha?: string | null;
          folio?: string | null;
          id?: string;
          num?: number;
          revision?: string | null;
          reviso?: string | null;
          solicitante?: string | null;
          titulo?: string;
          updated_at?: string;
        };
        Update: {
          aprobo?: string | null;
          centro_costos?: string | null;
          contexto?: string | null;
          created_at?: string;
          dirigido_a?: string | null;
          elaboro?: string | null;
          estatus?: string;
          fecha?: string | null;
          folio?: string | null;
          id?: string;
          num?: number;
          revision?: string | null;
          reviso?: string | null;
          solicitante?: string | null;
          titulo?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tareas: {
        Row: {
          completada_at: string | null;
          created_at: string;
          fecha_limite: string | null;
          id: string;
          notas: string | null;
          prioridad: string;
          proyecto_id: string | null;
          titulo: string;
        };
        Insert: {
          completada_at?: string | null;
          created_at?: string;
          fecha_limite?: string | null;
          id?: string;
          notas?: string | null;
          prioridad?: string;
          proyecto_id?: string | null;
          titulo: string;
        };
        Update: {
          completada_at?: string | null;
          created_at?: string;
          fecha_limite?: string | null;
          id?: string;
          notas?: string | null;
          prioridad?: string;
          proyecto_id?: string | null;
          titulo?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tareas_proyecto_id_fkey";
            columns: ["proyecto_id"];
            isOneToOne: false;
            referencedRelation: "proyectos";
            referencedColumns: ["id"];
          },
        ];
      };
      ticket_eventos: {
        Row: {
          autor: string | null;
          created_at: string;
          cuerpo: string | null;
          estado_anterior: string | null;
          estado_nuevo: string | null;
          id: string;
          ticket_id: string;
          tipo: string;
        };
        Insert: {
          autor?: string | null;
          created_at?: string;
          cuerpo?: string | null;
          estado_anterior?: string | null;
          estado_nuevo?: string | null;
          id?: string;
          ticket_id: string;
          tipo?: string;
        };
        Update: {
          autor?: string | null;
          created_at?: string;
          cuerpo?: string | null;
          estado_anterior?: string | null;
          estado_nuevo?: string | null;
          id?: string;
          ticket_id?: string;
          tipo?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ticket_eventos_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "tickets";
            referencedColumns: ["id"];
          },
        ];
      };
      tickets: {
        Row: {
          adjuntos: Json;
          asignado_a: string | null;
          asignado_email: string | null;
          categoria: string;
          created_at: string;
          descripcion: string | null;
          equipo_id: string | null;
          estado: string;
          id: string;
          num: number;
          primera_respuesta_at: string | null;
          prioridad: string;
          resuelto_at: string | null;
          solicitante: string;
          solicitante_email: string | null;
          titulo: string;
          updated_at: string;
        };
        Insert: {
          adjuntos?: Json;
          asignado_a?: string | null;
          asignado_email?: string | null;
          categoria?: string;
          created_at?: string;
          descripcion?: string | null;
          equipo_id?: string | null;
          estado?: string;
          id?: string;
          num?: number;
          primera_respuesta_at?: string | null;
          prioridad?: string;
          resuelto_at?: string | null;
          solicitante: string;
          solicitante_email?: string | null;
          titulo: string;
          updated_at?: string;
        };
        Update: {
          adjuntos?: Json;
          asignado_a?: string | null;
          asignado_email?: string | null;
          categoria?: string;
          created_at?: string;
          descripcion?: string | null;
          equipo_id?: string | null;
          estado?: string;
          id?: string;
          num?: number;
          primera_respuesta_at?: string | null;
          prioridad?: string;
          resuelto_at?: string | null;
          solicitante?: string;
          solicitante_email?: string | null;
          titulo?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tickets_equipo_id_fkey";
            columns: ["equipo_id"];
            isOneToOne: false;
            referencedRelation: "equipos";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
