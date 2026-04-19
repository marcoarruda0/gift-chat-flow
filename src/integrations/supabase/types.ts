export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      campanha_destinatarios: {
        Row: {
          campanha_id: string
          contato_id: string
          enviado_at: string | null
          erro: string | null
          id: string
          status: Database["public"]["Enums"]["destinatario_status"]
          telefone: string
          tenant_id: string
        }
        Insert: {
          campanha_id: string
          contato_id: string
          enviado_at?: string | null
          erro?: string | null
          id?: string
          status?: Database["public"]["Enums"]["destinatario_status"]
          telefone: string
          tenant_id: string
        }
        Update: {
          campanha_id?: string
          contato_id?: string
          enviado_at?: string | null
          erro?: string | null
          id?: string
          status?: Database["public"]["Enums"]["destinatario_status"]
          telefone?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campanha_destinatarios_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanha_destinatarios_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanha_destinatarios_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      campanhas: {
        Row: {
          agendada_para: string | null
          atraso_tipo: string
          created_at: string
          criado_por: string
          filtro_valor: string[] | null
          id: string
          mensagem: string
          midia_url: string | null
          nome: string
          status: Database["public"]["Enums"]["campanha_status"]
          tenant_id: string
          tipo_filtro: Database["public"]["Enums"]["campanha_filtro"]
          tipo_midia: string
          total_destinatarios: number
          total_enviados: number
          total_falhas: number
          updated_at: string
        }
        Insert: {
          agendada_para?: string | null
          atraso_tipo?: string
          created_at?: string
          criado_por: string
          filtro_valor?: string[] | null
          id?: string
          mensagem: string
          midia_url?: string | null
          nome: string
          status?: Database["public"]["Enums"]["campanha_status"]
          tenant_id: string
          tipo_filtro?: Database["public"]["Enums"]["campanha_filtro"]
          tipo_midia?: string
          total_destinatarios?: number
          total_enviados?: number
          total_falhas?: number
          updated_at?: string
        }
        Update: {
          agendada_para?: string | null
          atraso_tipo?: string
          created_at?: string
          criado_por?: string
          filtro_valor?: string[] | null
          id?: string
          mensagem?: string
          midia_url?: string | null
          nome?: string
          status?: Database["public"]["Enums"]["campanha_status"]
          tenant_id?: string
          tipo_filtro?: Database["public"]["Enums"]["campanha_filtro"]
          tipo_midia?: string
          total_destinatarios?: number
          total_enviados?: number
          total_falhas?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campanhas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      compras: {
        Row: {
          contato_id: string
          created_at: string
          giftback_gerado: number | null
          giftback_usado: number | null
          id: string
          operador_id: string | null
          tenant_id: string
          valor: number
        }
        Insert: {
          contato_id: string
          created_at?: string
          giftback_gerado?: number | null
          giftback_usado?: number | null
          id?: string
          operador_id?: string | null
          tenant_id: string
          valor: number
        }
        Update: {
          contato_id?: string
          created_at?: string
          giftback_gerado?: number | null
          giftback_usado?: number | null
          id?: string
          operador_id?: string | null
          tenant_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "compras_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conhecimento_base: {
        Row: {
          ativo: boolean | null
          categoria: string | null
          conteudo: string
          created_at: string | null
          id: string
          tags: string[] | null
          tenant_id: string
          titulo: string
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          categoria?: string | null
          conteudo: string
          created_at?: string | null
          id?: string
          tags?: string[] | null
          tenant_id: string
          titulo: string
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          categoria?: string | null
          conteudo?: string
          created_at?: string | null
          id?: string
          tags?: string[] | null
          tenant_id?: string
          titulo?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      contato_campos_config: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          obrigatorio: boolean
          opcoes: string[] | null
          ordem: number
          tenant_id: string
          tipo: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          obrigatorio?: boolean
          opcoes?: string[] | null
          ordem?: number
          tenant_id: string
          tipo?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          obrigatorio?: boolean
          opcoes?: string[] | null
          ordem?: number
          tenant_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "contato_campos_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contatos: {
        Row: {
          avatar_url: string | null
          campos_personalizados: Json
          cpf: string | null
          created_at: string
          data_nascimento: string | null
          email: string | null
          endereco: string | null
          id: string
          nome: string
          notas: string | null
          rfv_calculado_em: string | null
          rfv_frequencia: number | null
          rfv_recencia: number | null
          rfv_valor: number | null
          saldo_giftback: number | null
          tags: string[] | null
          telefone: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          campos_personalizados?: Json
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          nome: string
          notas?: string | null
          rfv_calculado_em?: string | null
          rfv_frequencia?: number | null
          rfv_recencia?: number | null
          rfv_valor?: number | null
          saldo_giftback?: number | null
          tags?: string[] | null
          telefone?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          campos_personalizados?: Json
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          nome?: string
          notas?: string | null
          rfv_calculado_em?: string | null
          rfv_frequencia?: number | null
          rfv_recencia?: number | null
          rfv_valor?: number | null
          saldo_giftback?: number | null
          tags?: string[] | null
          telefone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contatos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conversa_transferencias: {
        Row: {
          conversa_id: string
          created_at: string
          de_user_id: string
          id: string
          motivo: string | null
          para_user_id: string
          tenant_id: string
        }
        Insert: {
          conversa_id: string
          created_at?: string
          de_user_id: string
          id?: string
          motivo?: string | null
          para_user_id: string
          tenant_id: string
        }
        Update: {
          conversa_id?: string
          created_at?: string
          de_user_id?: string
          id?: string
          motivo?: string | null
          para_user_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversa_transferencias_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversa_transferencias_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conversas: {
        Row: {
          aguardando_humano: boolean
          atendente_id: string | null
          atendimento_encerrado_at: string | null
          atendimento_iniciado_at: string | null
          contato_id: string
          created_at: string
          departamento_id: string | null
          id: string
          marcada_nao_lida: boolean
          nao_lidas: number
          status: string
          tenant_id: string
          ultima_msg_at: string | null
          ultimo_texto: string | null
        }
        Insert: {
          aguardando_humano?: boolean
          atendente_id?: string | null
          atendimento_encerrado_at?: string | null
          atendimento_iniciado_at?: string | null
          contato_id: string
          created_at?: string
          departamento_id?: string | null
          id?: string
          marcada_nao_lida?: boolean
          nao_lidas?: number
          status?: string
          tenant_id: string
          ultima_msg_at?: string | null
          ultimo_texto?: string | null
        }
        Update: {
          aguardando_humano?: boolean
          atendente_id?: string | null
          atendimento_encerrado_at?: string | null
          atendimento_iniciado_at?: string | null
          contato_id?: string
          created_at?: string
          departamento_id?: string | null
          id?: string
          marcada_nao_lida?: boolean
          nao_lidas?: number
          status?: string
          tenant_id?: string
          ultima_msg_at?: string | null
          ultimo_texto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversas_atendente_id_fkey"
            columns: ["atendente_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "departamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      convites: {
        Row: {
          convidado_por: string
          created_at: string
          email: string
          expires_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          status: string
          tenant_id: string
          token: string
        }
        Insert: {
          convidado_por: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          tenant_id: string
          token?: string
        }
        Update: {
          convidado_por?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          tenant_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "convites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      departamento_distribuicao: {
        Row: {
          departamento_id: string
          id: string
          tenant_id: string
          ultimo_atendente_id: string | null
          updated_at: string
        }
        Insert: {
          departamento_id: string
          id?: string
          tenant_id: string
          ultimo_atendente_id?: string | null
          updated_at?: string
        }
        Update: {
          departamento_id?: string
          id?: string
          tenant_id?: string
          ultimo_atendente_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departamento_distribuicao_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "departamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departamento_distribuicao_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      departamentos: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          id: string
          nome: string
          tenant_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          tenant_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "departamentos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fluxo_config: {
        Row: {
          ativo: boolean
          created_at: string
          fluxo_id: string | null
          id: string
          tenant_id: string
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          fluxo_id?: string | null
          id?: string
          tenant_id: string
          tipo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          fluxo_id?: string | null
          id?: string
          tenant_id?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fluxo_config_fluxo_id_fkey"
            columns: ["fluxo_id"]
            isOneToOne: false
            referencedRelation: "fluxos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fluxo_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fluxo_sessoes: {
        Row: {
          aguardando_resposta: boolean | null
          conversa_id: string
          created_at: string | null
          dados: Json | null
          fluxo_id: string
          id: string
          node_atual: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          aguardando_resposta?: boolean | null
          conversa_id: string
          created_at?: string | null
          dados?: Json | null
          fluxo_id: string
          id?: string
          node_atual: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          aguardando_resposta?: boolean | null
          conversa_id?: string
          created_at?: string | null
          dados?: Json | null
          fluxo_id?: string
          id?: string
          node_atual?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fluxo_sessoes_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: true
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fluxo_sessoes_fluxo_id_fkey"
            columns: ["fluxo_id"]
            isOneToOne: false
            referencedRelation: "fluxos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fluxo_sessoes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fluxos: {
        Row: {
          created_at: string
          descricao: string | null
          edges_json: Json | null
          id: string
          nodes_json: Json | null
          nome: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          edges_json?: Json | null
          id?: string
          nodes_json?: Json | null
          nome?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          edges_json?: Json | null
          id?: string
          nodes_json?: Json | null
          nome?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fluxos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      giftback_config: {
        Row: {
          compra_minima: number | null
          created_at: string
          credito_maximo: number | null
          id: string
          max_resgate_pct: number | null
          percentual: number | null
          tenant_id: string
          validade_dias: number | null
        }
        Insert: {
          compra_minima?: number | null
          created_at?: string
          credito_maximo?: number | null
          id?: string
          max_resgate_pct?: number | null
          percentual?: number | null
          tenant_id: string
          validade_dias?: number | null
        }
        Update: {
          compra_minima?: number | null
          created_at?: string
          credito_maximo?: number | null
          id?: string
          max_resgate_pct?: number | null
          percentual?: number | null
          tenant_id?: string
          validade_dias?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "giftback_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      giftback_movimentos: {
        Row: {
          compra_id: string | null
          contato_id: string
          created_at: string
          id: string
          status: Database["public"]["Enums"]["giftback_status"] | null
          tenant_id: string
          tipo: Database["public"]["Enums"]["giftback_tipo"]
          validade: string | null
          valor: number
        }
        Insert: {
          compra_id?: string | null
          contato_id: string
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["giftback_status"] | null
          tenant_id: string
          tipo: Database["public"]["Enums"]["giftback_tipo"]
          validade?: string | null
          valor: number
        }
        Update: {
          compra_id?: string | null
          contato_id?: string
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["giftback_status"] | null
          tenant_id?: string
          tipo?: Database["public"]["Enums"]["giftback_tipo"]
          validade?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "giftback_movimentos_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "giftback_movimentos_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "giftback_movimentos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ia_config: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          instrucoes_extras: string | null
          nome_assistente: string
          tenant_id: string
          tom: Database["public"]["Enums"]["ia_tom"]
          updated_at: string
          usar_emojis: Database["public"]["Enums"]["ia_emojis"]
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          instrucoes_extras?: string | null
          nome_assistente?: string
          tenant_id: string
          tom?: Database["public"]["Enums"]["ia_tom"]
          updated_at?: string
          usar_emojis?: Database["public"]["Enums"]["ia_emojis"]
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          instrucoes_extras?: string | null
          nome_assistente?: string
          tenant_id?: string
          tom?: Database["public"]["Enums"]["ia_tom"]
          updated_at?: string
          usar_emojis?: Database["public"]["Enums"]["ia_emojis"]
        }
        Relationships: [
          {
            foreignKeyName: "ia_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens: {
        Row: {
          conteudo: string
          conversa_id: string
          created_at: string
          id: string
          metadata: Json | null
          remetente: Database["public"]["Enums"]["remetente_tipo"]
          tenant_id: string
          tipo: Database["public"]["Enums"]["mensagem_tipo"]
        }
        Insert: {
          conteudo: string
          conversa_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          remetente?: Database["public"]["Enums"]["remetente_tipo"]
          tenant_id: string
          tipo?: Database["public"]["Enums"]["mensagem_tipo"]
        }
        Update: {
          conteudo?: string
          conversa_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          remetente?: Database["public"]["Enums"]["remetente_tipo"]
          tenant_id?: string
          tipo?: Database["public"]["Enums"]["mensagem_tipo"]
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pinoquio_config: {
        Row: {
          api_base_url: string
          created_at: string
          id: string
          intervalo_polling_min: number
          jwt_token: string
          polling_ativo: boolean
          store_id: string
          template_mensagem: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          api_base_url?: string
          created_at?: string
          id?: string
          intervalo_polling_min?: number
          jwt_token?: string
          polling_ativo?: boolean
          store_id?: string
          template_mensagem?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          api_base_url?: string
          created_at?: string
          id?: string
          intervalo_polling_min?: number
          jwt_token?: string
          polling_ativo?: boolean
          store_id?: string
          template_mensagem?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pinoquio_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pinoquio_execucoes: {
        Row: {
          executado_em: string
          id: string
          tenant_id: string
          total_erros: number
          total_ignorados: number
          total_novos_enviados: number
          total_pendentes: number
        }
        Insert: {
          executado_em?: string
          id?: string
          tenant_id: string
          total_erros?: number
          total_ignorados?: number
          total_novos_enviados?: number
          total_pendentes?: number
        }
        Update: {
          executado_em?: string
          id?: string
          tenant_id?: string
          total_erros?: number
          total_ignorados?: number
          total_novos_enviados?: number
          total_pendentes?: number
        }
        Relationships: [
          {
            foreignKeyName: "pinoquio_execucoes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pinoquio_notificacoes: {
        Row: {
          cadastramento_id: number
          cadastramento_id_external: string | null
          created_at: string
          enviado_at: string | null
          erro_mensagem: string | null
          fornecedor_nome: string | null
          fornecedor_telefone: string | null
          id: string
          link_aprovacao: string | null
          lote: string | null
          mensagem_enviada: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          cadastramento_id: number
          cadastramento_id_external?: string | null
          created_at?: string
          enviado_at?: string | null
          erro_mensagem?: string | null
          fornecedor_nome?: string | null
          fornecedor_telefone?: string | null
          id?: string
          link_aprovacao?: string | null
          lote?: string | null
          mensagem_enviada?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          cadastramento_id?: number
          cadastramento_id_external?: string | null
          created_at?: string
          enviado_at?: string | null
          erro_mensagem?: string | null
          fornecedor_nome?: string | null
          fornecedor_telefone?: string | null
          id?: string
          link_aprovacao?: string | null
          lote?: string | null
          mensagem_enviada?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pinoquio_notificacoes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          apelido: string | null
          avatar_url: string | null
          created_at: string
          departamento: string | null
          departamento_id: string | null
          id: string
          mostrar_apelido: boolean
          nome: string | null
          tenant_id: string | null
        }
        Insert: {
          apelido?: string | null
          avatar_url?: string | null
          created_at?: string
          departamento?: string | null
          departamento_id?: string | null
          id: string
          mostrar_apelido?: boolean
          nome?: string | null
          tenant_id?: string | null
        }
        Update: {
          apelido?: string | null
          avatar_url?: string | null
          created_at?: string
          departamento?: string | null
          departamento_id?: string | null
          id?: string
          mostrar_apelido?: boolean
          nome?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "departamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      respostas_rapidas: {
        Row: {
          atalho: string
          conteudo: string
          created_at: string
          id: string
          tenant_id: string
        }
        Insert: {
          atalho: string
          conteudo: string
          created_at?: string
          id?: string
          tenant_id: string
        }
        Update: {
          atalho?: string
          conteudo?: string
          created_at?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "respostas_rapidas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          cnpj: string | null
          created_at: string
          id: string
          nome: string
          plano: string | null
          status: string | null
          telefone_empresa: string | null
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          id?: string
          nome: string
          plano?: string | null
          status?: string | null
          telefone_empresa?: string | null
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          id?: string
          nome?: string
          plano?: string | null
          status?: string | null
          telefone_empresa?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_tenants: {
        Row: {
          created_at: string
          id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_tenants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      zapi_config: {
        Row: {
          client_token: string
          created_at: string
          id: string
          instance_id: string
          status: string
          tenant_id: string
          token: string
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          client_token: string
          created_at?: string
          id?: string
          instance_id: string
          status?: string
          tenant_id: string
          token: string
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          client_token?: string
          created_at?: string
          id?: string
          instance_id?: string
          status?: string
          tenant_id?: string
          token?: string
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "zapi_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      distribuir_atendente: {
        Args: { p_departamento_id: string; p_tenant_id: string }
        Returns: string
      }
      get_user_tenant_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_same_tenant: { Args: { _target_user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin_master" | "admin_tenant" | "atendente" | "caixa"
      campanha_filtro: "todos" | "tag" | "manual" | "rfv"
      campanha_status:
        | "rascunho"
        | "agendada"
        | "enviando"
        | "concluida"
        | "cancelada"
      destinatario_status: "pendente" | "enviado" | "falha"
      giftback_status: "ativo" | "usado" | "expirado"
      giftback_tipo: "credito" | "debito" | "expiracao"
      ia_emojis: "nao" | "pouco" | "sim"
      ia_tom: "formal" | "amigavel" | "casual"
      mensagem_tipo: "texto" | "imagem" | "audio" | "video" | "documento"
      remetente_tipo: "contato" | "atendente" | "bot" | "sistema"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin_master", "admin_tenant", "atendente", "caixa"],
      campanha_filtro: ["todos", "tag", "manual", "rfv"],
      campanha_status: [
        "rascunho",
        "agendada",
        "enviando",
        "concluida",
        "cancelada",
      ],
      destinatario_status: ["pendente", "enviado", "falha"],
      giftback_status: ["ativo", "usado", "expirado"],
      giftback_tipo: ["credito", "debito", "expiracao"],
      ia_emojis: ["nao", "pouco", "sim"],
      ia_tom: ["formal", "amigavel", "casual"],
      mensagem_tipo: ["texto", "imagem", "audio", "video", "documento"],
      remetente_tipo: ["contato", "atendente", "bot", "sistema"],
    },
  },
} as const
