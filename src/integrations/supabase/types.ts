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
      atendimento_satisfacao: {
        Row: {
          atendente_id: string | null
          canal: string
          classificacao:
            | Database["public"]["Enums"]["satisfacao_classificacao"]
            | null
          contato_id: string | null
          conversa_id: string
          created_at: string
          departamento_id: string | null
          duracao_segundos: number | null
          erro: string | null
          houve_transferencia: boolean | null
          id: string
          justificativa: string | null
          motivo_ignorado: string | null
          pontos_negativos: string[] | null
          pontos_positivos: string[] | null
          primeiro_resp_segundos: number | null
          processado_em: string | null
          score: number | null
          sentimento:
            | Database["public"]["Enums"]["satisfacao_sentimento"]
            | null
          status: string
          tempo_medio_resposta_segundos: number | null
          tenant_id: string
          terminou_sem_resposta: boolean | null
          total_mensagens_atendente: number | null
          total_mensagens_cliente: number | null
        }
        Insert: {
          atendente_id?: string | null
          canal: string
          classificacao?:
            | Database["public"]["Enums"]["satisfacao_classificacao"]
            | null
          contato_id?: string | null
          conversa_id: string
          created_at?: string
          departamento_id?: string | null
          duracao_segundos?: number | null
          erro?: string | null
          houve_transferencia?: boolean | null
          id?: string
          justificativa?: string | null
          motivo_ignorado?: string | null
          pontos_negativos?: string[] | null
          pontos_positivos?: string[] | null
          primeiro_resp_segundos?: number | null
          processado_em?: string | null
          score?: number | null
          sentimento?:
            | Database["public"]["Enums"]["satisfacao_sentimento"]
            | null
          status?: string
          tempo_medio_resposta_segundos?: number | null
          tenant_id: string
          terminou_sem_resposta?: boolean | null
          total_mensagens_atendente?: number | null
          total_mensagens_cliente?: number | null
        }
        Update: {
          atendente_id?: string | null
          canal?: string
          classificacao?:
            | Database["public"]["Enums"]["satisfacao_classificacao"]
            | null
          contato_id?: string | null
          conversa_id?: string
          created_at?: string
          departamento_id?: string | null
          duracao_segundos?: number | null
          erro?: string | null
          houve_transferencia?: boolean | null
          id?: string
          justificativa?: string | null
          motivo_ignorado?: string | null
          pontos_negativos?: string[] | null
          pontos_positivos?: string[] | null
          primeiro_resp_segundos?: number | null
          processado_em?: string | null
          score?: number | null
          sentimento?:
            | Database["public"]["Enums"]["satisfacao_sentimento"]
            | null
          status?: string
          tempo_medio_resposta_segundos?: number | null
          tenant_id?: string
          terminou_sem_resposta?: boolean | null
          total_mensagens_atendente?: number | null
          total_mensagens_cliente?: number | null
        }
        Relationships: []
      }
      campanha_destinatarios: {
        Row: {
          campanha_id: string
          contato_id: string
          delivery_error: Json | null
          enviado_at: string | null
          erro: string | null
          id: string
          status: Database["public"]["Enums"]["destinatario_status"]
          status_entrega: string | null
          status_entrega_at: string | null
          telefone: string
          tenant_id: string
          wa_message_id: string | null
        }
        Insert: {
          campanha_id: string
          contato_id: string
          delivery_error?: Json | null
          enviado_at?: string | null
          erro?: string | null
          id?: string
          status?: Database["public"]["Enums"]["destinatario_status"]
          status_entrega?: string | null
          status_entrega_at?: string | null
          telefone: string
          tenant_id: string
          wa_message_id?: string | null
        }
        Update: {
          campanha_id?: string
          contato_id?: string
          delivery_error?: Json | null
          enviado_at?: string | null
          erro?: string | null
          id?: string
          status?: Database["public"]["Enums"]["destinatario_status"]
          status_entrega?: string | null
          status_entrega_at?: string | null
          telefone?: string
          tenant_id?: string
          wa_message_id?: string | null
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
      campanha_grupos: {
        Row: {
          cor: string | null
          created_at: string
          descricao: string | null
          id: string
          nome: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          cor?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          cor?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      campanhas: {
        Row: {
          agendada_para: string | null
          atraso_tipo: string
          canal: string
          created_at: string
          criado_por: string
          email_assunto: string | null
          email_html: string | null
          email_preview: string | null
          filtro_valor: string[] | null
          grupo_id: string | null
          id: string
          mensagem: string
          midia_url: string | null
          nome: string
          status: Database["public"]["Enums"]["campanha_status"]
          template_components: Json
          template_id: string | null
          template_language: string | null
          template_name: string | null
          template_variaveis: Json
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
          canal?: string
          created_at?: string
          criado_por: string
          email_assunto?: string | null
          email_html?: string | null
          email_preview?: string | null
          filtro_valor?: string[] | null
          grupo_id?: string | null
          id?: string
          mensagem: string
          midia_url?: string | null
          nome: string
          status?: Database["public"]["Enums"]["campanha_status"]
          template_components?: Json
          template_id?: string | null
          template_language?: string | null
          template_name?: string | null
          template_variaveis?: Json
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
          canal?: string
          created_at?: string
          criado_por?: string
          email_assunto?: string | null
          email_html?: string | null
          email_preview?: string | null
          filtro_valor?: string[] | null
          grupo_id?: string | null
          id?: string
          mensagem?: string
          midia_url?: string | null
          nome?: string
          status?: Database["public"]["Enums"]["campanha_status"]
          template_components?: Json
          template_id?: string | null
          template_language?: string | null
          template_name?: string | null
          template_variaveis?: Json
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
      chamado_denis_entregas_log: {
        Row: {
          acao: string
          assinatura: string | null
          created_at: string
          id: string
          item_id: string
          retirante_doc: string | null
          retirante_nome: string | null
          retirante_proprio: boolean | null
          tenant_id: string
          usuario_id: string | null
          usuario_nome: string | null
        }
        Insert: {
          acao: string
          assinatura?: string | null
          created_at?: string
          id?: string
          item_id: string
          retirante_doc?: string | null
          retirante_nome?: string | null
          retirante_proprio?: boolean | null
          tenant_id: string
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Update: {
          acao?: string
          assinatura?: string | null
          created_at?: string
          id?: string
          item_id?: string
          retirante_doc?: string | null
          retirante_nome?: string | null
          retirante_proprio?: boolean | null
          tenant_id?: string
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Relationships: []
      }
      chamado_denis_itens: {
        Row: {
          abacate_billing_id: string | null
          abacate_product_external_id: string | null
          abacate_product_id: string | null
          abacate_status: string | null
          abacate_url: string | null
          created_at: string
          created_by: string | null
          descricao: string
          entregue: boolean
          entregue_assinatura: string | null
          entregue_em: string | null
          entregue_para_doc: string | null
          entregue_para_nome: string | null
          entregue_para_proprio: boolean | null
          entregue_por: string | null
          forma_pagamento: string | null
          id: string
          local_id: string | null
          numero: number
          pagador_cel: string | null
          pagador_email: string | null
          pagador_nome: string | null
          pagador_tax_id: string | null
          pago_em: string | null
          status: string
          tenant_id: string
          updated_at: string
          valor: number
        }
        Insert: {
          abacate_billing_id?: string | null
          abacate_product_external_id?: string | null
          abacate_product_id?: string | null
          abacate_status?: string | null
          abacate_url?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string
          entregue?: boolean
          entregue_assinatura?: string | null
          entregue_em?: string | null
          entregue_para_doc?: string | null
          entregue_para_nome?: string | null
          entregue_para_proprio?: boolean | null
          entregue_por?: string | null
          forma_pagamento?: string | null
          id?: string
          local_id?: string | null
          numero: number
          pagador_cel?: string | null
          pagador_email?: string | null
          pagador_nome?: string | null
          pagador_tax_id?: string | null
          pago_em?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          valor?: number
        }
        Update: {
          abacate_billing_id?: string | null
          abacate_product_external_id?: string | null
          abacate_product_id?: string | null
          abacate_status?: string | null
          abacate_url?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string
          entregue?: boolean
          entregue_assinatura?: string | null
          entregue_em?: string | null
          entregue_para_doc?: string | null
          entregue_para_nome?: string | null
          entregue_para_proprio?: boolean | null
          entregue_por?: string | null
          forma_pagamento?: string | null
          id?: string
          local_id?: string | null
          numero?: number
          pagador_cel?: string | null
          pagador_email?: string | null
          pagador_nome?: string | null
          pagador_tax_id?: string | null
          pago_em?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "chamado_denis_itens_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "vendas_online_locais"
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
          genero: string | null
          id: string
          instagram_id: string | null
          instagram_username: string | null
          nome: string
          notas: string | null
          opt_out_at: string | null
          opt_out_whatsapp: boolean
          rfv_calculado_em: string | null
          rfv_frequencia: number | null
          rfv_recencia: number | null
          rfv_soma: number | null
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
          genero?: string | null
          id?: string
          instagram_id?: string | null
          instagram_username?: string | null
          nome: string
          notas?: string | null
          opt_out_at?: string | null
          opt_out_whatsapp?: boolean
          rfv_calculado_em?: string | null
          rfv_frequencia?: number | null
          rfv_recencia?: number | null
          rfv_soma?: number | null
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
          genero?: string | null
          id?: string
          instagram_id?: string | null
          instagram_username?: string | null
          nome?: string
          notas?: string | null
          opt_out_at?: string | null
          opt_out_whatsapp?: boolean
          rfv_calculado_em?: string | null
          rfv_frequencia?: number | null
          rfv_recencia?: number | null
          rfv_soma?: number | null
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
      conversa_fixacoes: {
        Row: {
          conversa_id: string
          fixada_at: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          conversa_id: string
          fixada_at?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          conversa_id?: string
          fixada_at?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversa_fixacoes_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
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
          canal: string
          contato_id: string
          created_at: string
          departamento_id: string | null
          id: string
          instagram_thread_id: string | null
          marcada_nao_lida: boolean
          nao_lidas: number
          status: string
          tenant_id: string
          ultima_msg_at: string | null
          ultimo_texto: string | null
          whatsapp_cloud_phone_id: string | null
        }
        Insert: {
          aguardando_humano?: boolean
          atendente_id?: string | null
          atendimento_encerrado_at?: string | null
          atendimento_iniciado_at?: string | null
          canal?: string
          contato_id: string
          created_at?: string
          departamento_id?: string | null
          id?: string
          instagram_thread_id?: string | null
          marcada_nao_lida?: boolean
          nao_lidas?: number
          status?: string
          tenant_id: string
          ultima_msg_at?: string | null
          ultimo_texto?: string | null
          whatsapp_cloud_phone_id?: string | null
        }
        Update: {
          aguardando_humano?: boolean
          atendente_id?: string | null
          atendimento_encerrado_at?: string | null
          atendimento_iniciado_at?: string | null
          canal?: string
          contato_id?: string
          created_at?: string
          departamento_id?: string | null
          id?: string
          instagram_thread_id?: string | null
          marcada_nao_lida?: boolean
          nao_lidas?: number
          status?: string
          tenant_id?: string
          ultima_msg_at?: string | null
          ultimo_texto?: string | null
          whatsapp_cloud_phone_id?: string | null
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
      giftback_comunicacao_config: {
        Row: {
          ativo: boolean
          created_at: string
          horario_envio: string
          id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          horario_envio?: string
          id?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          horario_envio?: string
          id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      giftback_comunicacao_log: {
        Row: {
          contato_id: string | null
          enviado_em: string
          erro: string | null
          id: string
          is_teste: boolean
          movimento_id: string
          regra_id: string | null
          status: string
          tenant_id: string
          wa_message_id: string | null
        }
        Insert: {
          contato_id?: string | null
          enviado_em?: string
          erro?: string | null
          id?: string
          is_teste?: boolean
          movimento_id: string
          regra_id?: string | null
          status: string
          tenant_id: string
          wa_message_id?: string | null
        }
        Update: {
          contato_id?: string | null
          enviado_em?: string
          erro?: string | null
          id?: string
          is_teste?: boolean
          movimento_id?: string
          regra_id?: string | null
          status?: string
          tenant_id?: string
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "giftback_comunicacao_log_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "giftback_comunicacao_log_regra_id_fkey"
            columns: ["regra_id"]
            isOneToOne: false
            referencedRelation: "giftback_comunicacao_regras"
            referencedColumns: ["id"]
          },
        ]
      }
      giftback_comunicacao_regras: {
        Row: {
          ativo: boolean
          created_at: string
          dias_offset: number
          filtro_rfv_modo: string
          filtro_rfv_segmentos: string[]
          id: string
          nome: string
          template_components: Json
          template_language: string
          template_name: string
          template_variaveis: Json
          tenant_id: string
          tipo_gatilho: Database["public"]["Enums"]["gb_gatilho_tipo"]
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          dias_offset?: number
          filtro_rfv_modo?: string
          filtro_rfv_segmentos?: string[]
          id?: string
          nome: string
          template_components?: Json
          template_language?: string
          template_name: string
          template_variaveis?: Json
          tenant_id: string
          tipo_gatilho: Database["public"]["Enums"]["gb_gatilho_tipo"]
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          dias_offset?: number
          filtro_rfv_modo?: string
          filtro_rfv_segmentos?: string[]
          id?: string
          nome?: string
          template_components?: Json
          template_language?: string
          template_name?: string
          template_variaveis?: Json
          tenant_id?: string
          tipo_gatilho?: Database["public"]["Enums"]["gb_gatilho_tipo"]
          updated_at?: string
        }
        Relationships: []
      }
      giftback_config: {
        Row: {
          created_at: string
          id: string
          multiplicador_compra_minima: number
          percentual: number | null
          tenant_id: string
          validade_dias: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          multiplicador_compra_minima?: number
          percentual?: number | null
          tenant_id: string
          validade_dias?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          multiplicador_compra_minima?: number
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
      giftback_config_rfv: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          multiplicador_compra_minima: number | null
          percentual: number | null
          segmento: string
          tenant_id: string
          updated_at: string
          validade_dias: number | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          multiplicador_compra_minima?: number | null
          percentual?: number | null
          segmento: string
          tenant_id: string
          updated_at?: string
          validade_dias?: number | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          multiplicador_compra_minima?: number | null
          percentual?: number | null
          segmento?: string
          tenant_id?: string
          updated_at?: string
          validade_dias?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "giftback_config_rfv_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
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
          motivo_inativacao: string | null
          regra_percentual: number | null
          segmento_rfv: string | null
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
          motivo_inativacao?: string | null
          regra_percentual?: number | null
          segmento_rfv?: string | null
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
          motivo_inativacao?: string | null
          regra_percentual?: number | null
          segmento_rfv?: string | null
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
      ia_analises_conversas: {
        Row: {
          concluido_em: string | null
          created_at: string
          erro_mensagem: string | null
          id: string
          iniciado_por: string | null
          periodo_fim: string | null
          periodo_inicio: string | null
          resumo_markdown: string | null
          status: string
          sugestoes_instrucoes: string | null
          tenant_id: string
          total_conversas: number | null
          total_mensagens: number | null
        }
        Insert: {
          concluido_em?: string | null
          created_at?: string
          erro_mensagem?: string | null
          id?: string
          iniciado_por?: string | null
          periodo_fim?: string | null
          periodo_inicio?: string | null
          resumo_markdown?: string | null
          status?: string
          sugestoes_instrucoes?: string | null
          tenant_id: string
          total_conversas?: number | null
          total_mensagens?: number | null
        }
        Update: {
          concluido_em?: string | null
          created_at?: string
          erro_mensagem?: string | null
          id?: string
          iniciado_por?: string | null
          periodo_fim?: string | null
          periodo_inicio?: string | null
          resumo_markdown?: string | null
          status?: string
          sugestoes_instrucoes?: string | null
          tenant_id?: string
          total_conversas?: number | null
          total_mensagens?: number | null
        }
        Relationships: []
      }
      ia_config: {
        Row: {
          ativo: boolean
          copiloto_ativo: boolean
          copiloto_canais: string[]
          created_at: string
          id: string
          instrucoes_extras: string | null
          nome_assistente: string
          satisfacao_ativo: boolean
          satisfacao_criterios: string | null
          satisfacao_min_mensagens_cliente: number
          tenant_id: string
          tom: Database["public"]["Enums"]["ia_tom"]
          transcricao_audio_ativo: boolean
          transcricao_audio_idioma: string
          ultima_analise_em: string | null
          ultima_analise_resumo: string | null
          updated_at: string
          usar_emojis: Database["public"]["Enums"]["ia_emojis"]
        }
        Insert: {
          ativo?: boolean
          copiloto_ativo?: boolean
          copiloto_canais?: string[]
          created_at?: string
          id?: string
          instrucoes_extras?: string | null
          nome_assistente?: string
          satisfacao_ativo?: boolean
          satisfacao_criterios?: string | null
          satisfacao_min_mensagens_cliente?: number
          tenant_id: string
          tom?: Database["public"]["Enums"]["ia_tom"]
          transcricao_audio_ativo?: boolean
          transcricao_audio_idioma?: string
          ultima_analise_em?: string | null
          ultima_analise_resumo?: string | null
          updated_at?: string
          usar_emojis?: Database["public"]["Enums"]["ia_emojis"]
        }
        Update: {
          ativo?: boolean
          copiloto_ativo?: boolean
          copiloto_canais?: string[]
          created_at?: string
          id?: string
          instrucoes_extras?: string | null
          nome_assistente?: string
          satisfacao_ativo?: boolean
          satisfacao_criterios?: string | null
          satisfacao_min_mensagens_cliente?: number
          tenant_id?: string
          tom?: Database["public"]["Enums"]["ia_tom"]
          transcricao_audio_ativo?: boolean
          transcricao_audio_idioma?: string
          ultima_analise_em?: string | null
          ultima_analise_resumo?: string | null
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
      ia_rascunhos: {
        Row: {
          atendente_id: string
          baseado_em_mensagem_id: string | null
          conteudo_enviado: string | null
          conteudo_sugerido: string
          conversa_id: string
          created_at: string
          fontes: Json | null
          id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          atendente_id: string
          baseado_em_mensagem_id?: string | null
          conteudo_enviado?: string | null
          conteudo_sugerido: string
          conversa_id: string
          created_at?: string
          fontes?: Json | null
          id?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          atendente_id?: string
          baseado_em_mensagem_id?: string | null
          conteudo_enviado?: string | null
          conteudo_sugerido?: string
          conversa_id?: string
          created_at?: string
          fontes?: Json | null
          id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      instagram_config: {
        Row: {
          created_at: string
          id: string
          ig_user_id: string
          ig_username: string | null
          page_access_token: string
          page_id: string
          status: string
          tenant_id: string
          token_expires_at: string | null
          ultima_mensagem_at: string | null
          ultima_verificacao_at: string | null
          ultimo_erro: string | null
          updated_at: string
          user_access_token: string | null
          verify_token: string
        }
        Insert: {
          created_at?: string
          id?: string
          ig_user_id: string
          ig_username?: string | null
          page_access_token: string
          page_id: string
          status?: string
          tenant_id: string
          token_expires_at?: string | null
          ultima_mensagem_at?: string | null
          ultima_verificacao_at?: string | null
          ultimo_erro?: string | null
          updated_at?: string
          user_access_token?: string | null
          verify_token?: string
        }
        Update: {
          created_at?: string
          id?: string
          ig_user_id?: string
          ig_username?: string | null
          page_access_token?: string
          page_id?: string
          status?: string
          tenant_id?: string
          token_expires_at?: string | null
          ultima_mensagem_at?: string | null
          ultima_verificacao_at?: string | null
          ultimo_erro?: string | null
          updated_at?: string
          user_access_token?: string | null
          verify_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lgpd_config: {
        Row: {
          created_at: string
          id: string
          incluir_link_automatico: boolean
          politica_privacidade_url: string | null
          tenant_id: string
          texto_descadastro: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          incluir_link_automatico?: boolean
          politica_privacidade_url?: string | null
          tenant_id: string
          texto_descadastro?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          incluir_link_automatico?: boolean
          politica_privacidade_url?: string | null
          tenant_id?: string
          texto_descadastro?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      mensagens: {
        Row: {
          conteudo: string
          conversa_id: string
          created_at: string
          id: string
          metadata: Json | null
          remetente: Database["public"]["Enums"]["remetente_tipo"]
          status_entrega: string | null
          status_entrega_at: string | null
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
          status_entrega?: string | null
          status_entrega_at?: string | null
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
          status_entrega?: string | null
          status_entrega_at?: string | null
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
      optout_tokens: {
        Row: {
          campanha_id: string | null
          contato_id: string
          created_at: string
          id: string
          tenant_id: string
          token: string
          used_at: string | null
        }
        Insert: {
          campanha_id?: string | null
          contato_id: string
          created_at?: string
          id?: string
          tenant_id: string
          token?: string
          used_at?: string | null
        }
        Update: {
          campanha_id?: string | null
          contato_id?: string
          created_at?: string
          id?: string
          tenant_id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
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
          email_assinatura: string | null
          email_remetente_local: string | null
          email_remetente_nome: string | null
          email_reply_to: string | null
          id: string
          nome: string
          plano: string | null
          status: string | null
          telefone_empresa: string | null
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          email_assinatura?: string | null
          email_remetente_local?: string | null
          email_remetente_nome?: string | null
          email_reply_to?: string | null
          id?: string
          nome: string
          plano?: string | null
          status?: string | null
          telefone_empresa?: string | null
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          email_assinatura?: string | null
          email_remetente_local?: string | null
          email_remetente_nome?: string | null
          email_reply_to?: string | null
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
      vendas_online_config: {
        Row: {
          abacate_api_key: string | null
          api_version: number
          created_at: string
          dev_mode: boolean
          tenant_id: string
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          abacate_api_key?: string | null
          api_version?: number
          created_at?: string
          dev_mode?: boolean
          tenant_id: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          abacate_api_key?: string | null
          api_version?: number
          created_at?: string
          dev_mode?: boolean
          tenant_id?: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendas_online_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas_online_locais: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          id: string
          nome: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      vendas_online_webhook_log: {
        Row: {
          billing_id: string | null
          created_at: string
          erro: string | null
          event: string | null
          id: string
          payload: Json | null
          processado: boolean
          tenant_id: string | null
        }
        Insert: {
          billing_id?: string | null
          created_at?: string
          erro?: string | null
          event?: string | null
          id?: string
          payload?: Json | null
          processado?: boolean
          tenant_id?: string | null
        }
        Update: {
          billing_id?: string | null
          created_at?: string
          erro?: string | null
          event?: string | null
          id?: string
          payload?: Json | null
          processado?: boolean
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendas_online_webhook_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_alertas: {
        Row: {
          created_at: string
          detalhe: string | null
          id: string
          limite_pct: number
          taxa_erro_pct: number
          tenant_id: string
          tipo: string
          total_erros: number
          total_eventos: number
        }
        Insert: {
          created_at?: string
          detalhe?: string | null
          id?: string
          limite_pct: number
          taxa_erro_pct: number
          tenant_id: string
          tipo: string
          total_erros: number
          total_eventos: number
        }
        Update: {
          created_at?: string
          detalhe?: string | null
          id?: string
          limite_pct?: number
          taxa_erro_pct?: number
          tenant_id?: string
          tipo?: string
          total_erros?: number
          total_eventos?: number
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_alertas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_cloud_config: {
        Row: {
          access_token: string
          alerta_min_eventos: number
          alerta_taxa_erro_pct: number
          created_at: string
          display_phone: string | null
          id: string
          phone_number_id: string
          status: string
          tenant_id: string
          ultima_mensagem_at: string | null
          ultima_verificacao_at: string | null
          ultimo_erro: string | null
          ultimo_teste_at: string | null
          updated_at: string
          verify_token: string
          waba_id: string
        }
        Insert: {
          access_token: string
          alerta_min_eventos?: number
          alerta_taxa_erro_pct?: number
          created_at?: string
          display_phone?: string | null
          id?: string
          phone_number_id: string
          status?: string
          tenant_id: string
          ultima_mensagem_at?: string | null
          ultima_verificacao_at?: string | null
          ultimo_erro?: string | null
          ultimo_teste_at?: string | null
          updated_at?: string
          verify_token: string
          waba_id: string
        }
        Update: {
          access_token?: string
          alerta_min_eventos?: number
          alerta_taxa_erro_pct?: number
          created_at?: string
          display_phone?: string | null
          id?: string
          phone_number_id?: string
          status?: string
          tenant_id?: string
          ultima_mensagem_at?: string | null
          ultima_verificacao_at?: string | null
          ultimo_erro?: string | null
          ultimo_teste_at?: string | null
          updated_at?: string
          verify_token?: string
          waba_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_cloud_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_cloud_templates: {
        Row: {
          category: string | null
          components: Json
          created_at: string
          id: string
          language: string
          meta_template_id: string | null
          name: string
          rejection_reason: string | null
          status: string
          synced_at: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          components?: Json
          created_at?: string
          id?: string
          language: string
          meta_template_id?: string | null
          name: string
          rejection_reason?: string | null
          status?: string
          synced_at?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          components?: Json
          created_at?: string
          id?: string
          language?: string
          meta_template_id?: string | null
          name?: string
          rejection_reason?: string | null
          status?: string
          synced_at?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_webhook_eventos: {
        Row: {
          conversas_criadas: number
          erro_mensagem: string | null
          hmac_valido: boolean | null
          id: string
          mensagens_criadas: number
          payload: Json
          payload_hash: string | null
          phone_number_id: string | null
          processado_at: string | null
          recebido_at: string
          reprocessado_em: string | null
          status: string
          tenant_id: string | null
        }
        Insert: {
          conversas_criadas?: number
          erro_mensagem?: string | null
          hmac_valido?: boolean | null
          id?: string
          mensagens_criadas?: number
          payload: Json
          payload_hash?: string | null
          phone_number_id?: string | null
          processado_at?: string | null
          recebido_at?: string
          reprocessado_em?: string | null
          status?: string
          tenant_id?: string | null
        }
        Update: {
          conversas_criadas?: number
          erro_mensagem?: string | null
          hmac_valido?: boolean | null
          id?: string
          mensagens_criadas?: number
          payload?: Json
          payload_hash?: string | null
          phone_number_id?: string | null
          processado_at?: string | null
          recebido_at?: string
          reprocessado_em?: string | null
          status?: string
          tenant_id?: string | null
        }
        Relationships: []
      }
      zapi_config: {
        Row: {
          client_token: string
          connected_phone: string | null
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
          connected_phone?: string | null
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
          connected_phone?: string | null
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
      zapi_webhook_eventos: {
        Row: {
          created_at: string
          error_msg: string | null
          id: string
          instance_id: string | null
          payload: Json
          processed: boolean
          processed_at: string | null
          resultado: Json | null
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          error_msg?: string | null
          id?: string
          instance_id?: string | null
          payload: Json
          processed?: boolean
          processed_at?: string | null
          resultado?: Json | null
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          error_msg?: string | null
          id?: string
          instance_id?: string | null
          payload?: Json
          processed?: boolean
          processed_at?: string | null
          resultado?: Json | null
          tenant_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      contato_resumo: { Args: { p_contato_id: string }; Returns: Json }
      contato_timeline: {
        Args: { p_contato_id: string; p_limit?: number }
        Returns: Json
      }
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
      relatorio_giftback: {
        Args: { p_atendente_id?: string; p_fim: string; p_inicio: string }
        Returns: Json
      }
      relatorio_satisfacao: {
        Args: {
          p_atendente_id?: string
          p_canal?: string
          p_departamento_id?: string
          p_fim: string
          p_inicio: string
        }
        Returns: Json
      }
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
      destinatario_status: "pendente" | "enviado" | "falha" | "optout"
      gb_gatilho_tipo: "criado" | "vencendo" | "expirado"
      giftback_status: "ativo" | "usado" | "expirado" | "inativo"
      giftback_tipo: "credito" | "debito" | "expiracao"
      ia_emojis: "nao" | "pouco" | "sim"
      ia_tom: "formal" | "amigavel" | "casual"
      mensagem_tipo: "texto" | "imagem" | "audio" | "video" | "documento"
      remetente_tipo: "contato" | "atendente" | "bot" | "sistema"
      satisfacao_classificacao:
        | "muito_insatisfeito"
        | "insatisfeito"
        | "neutro"
        | "satisfeito"
        | "muito_satisfeito"
      satisfacao_sentimento: "positivo" | "neutro" | "negativo"
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
      destinatario_status: ["pendente", "enviado", "falha", "optout"],
      gb_gatilho_tipo: ["criado", "vencendo", "expirado"],
      giftback_status: ["ativo", "usado", "expirado", "inativo"],
      giftback_tipo: ["credito", "debito", "expiracao"],
      ia_emojis: ["nao", "pouco", "sim"],
      ia_tom: ["formal", "amigavel", "casual"],
      mensagem_tipo: ["texto", "imagem", "audio", "video", "documento"],
      remetente_tipo: ["contato", "atendente", "bot", "sistema"],
      satisfacao_classificacao: [
        "muito_insatisfeito",
        "insatisfeito",
        "neutro",
        "satisfeito",
        "muito_satisfeito",
      ],
      satisfacao_sentimento: ["positivo", "neutro", "negativo"],
    },
  },
} as const
