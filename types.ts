export interface UploadedFileRecord {
  id: string;
  userId: string;
  originalName: string;
  savedName: string;
  fileType: "image" | "audio";
  url: string;
  createdAt: string;
  isLocal?: boolean;
}

export interface PrankRecord {
  id: string;
  userId: string;
  name?: string;
  imageUrl: string;
  audioUrl: string;
  imageName: string;
  audioName: string;
  createdAt: string;
  notificationEmail?: string;
  notificationWebhook?: string;
  scansCount?: number;
  scansLog?: Array<{
    timestamp: string;
    action: "scansionato" | "accettato" | "rifiutato";
    userAgent?: string;
    deviceModel?: string;
    locationName?: string;
    ipAddress?: string;
  }>;
  enableFlash?: boolean;
  enableVibration?: boolean;
  enableLoadingBar?: boolean;
  isLocal?: boolean;
}
