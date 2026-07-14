type TemplateConnection = { id: string; channel?: string | null; status?: string | null };

export function selectTemplateConnections<T extends TemplateConnection>(connections: T[], connectionId?: string): T[] {
  if (connectionId) return connections.filter(connection => connection.id === connectionId);
  return connections.filter(connection =>
    connection.status !== "disabled" && String(connection.channel ?? "").toLowerCase().includes("whatsapp")
  );
}
