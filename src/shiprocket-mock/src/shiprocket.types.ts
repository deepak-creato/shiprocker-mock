export type ShiprocketAuthRequest = { email?: string; password?: string };

export type ShiprocketAuthResponse = {
  id: number;
  token: string;
  email: string;
  first_name: string;
  last_name: string;
  created_at: string;
};

export type ShiprocketServiceabilityResponse = {
  status: number;
  data: {
    available_courier_companies: Array<{
      courier_company_id: number;
      courier_name: string;
      freight_charge: number;
      cod_charges: number;
      rate: number;
      estimated_delivery_days: number;
      is_surface: boolean;
      cod: number;
    }>;
  };
};

export type ShiprocketCreateOrderResponse = {
  order_id: number;
  shipment_id: number;
  status: string;
  status_code: number;
};

export type ShiprocketCreateExchangeOrderResponse = {
  success: boolean;
  data: {
    forward_orders: {
      order_id: number;
      channel_order_id: string;
      shipment_id: number;
      status: string;
      status_code: number;
    };
    return_orders: {
      order_id: number;
      channel_order_id: string;
      shipment_id: number;
      status: string;
      status_code: number;
    };
  };
};

export type ShiprocketAssignAWBRequest = {
  shipment_id: number;
  courier_id: number;
};

export type ShiprocketAssignAWBResponse = {
  awb_assign_status: number;
  response: {
    data: {
      awb_code: string;
      courier_name: string;
      courier_id: number;
      assigned_date_time: string;
    };
  };
};

export type ShiprocketPickupRequest = { shipment_id: number[] };
export type ShiprocketPickupResponse = {
  pickup_status: number;
  response: { pickup_scheduled_date: string; pickup_token_number: string };
};

export type ShiprocketLabelRequest = { shipment_id: number[] };
export type ShiprocketLabelResponse = {
  label_created: number;
  response: { label_url: string };
  label_url: string;
};

export type ShiprocketManifestRequest = { shipment_id: number[] };
export type ShiprocketManifestResponse = { manifest_url: string };

export type ShiprocketTrackingResponse = {
  tracking_data: {
    awb_code: string;
    shipment_status: string;
    shipment_status_id: number;
    etd: string;
    shipment_track: Array<{
      current_status: string;
      delivered_date: string | null;
    }>;
    shipment_track_activities: unknown;
  };
};

export type ShiprocketNdrReattemptRequest = { awb: string };
export type ShiprocketNdrReturnRequest = { awb: string };
export type ShiprocketNdrResponse = { message: string; status: number };

export type ShiprocketCancelRequest = { ids: number[] };
export type ShiprocketCancelResponse = { message: string; status: number };

export type ShiprocketAddPickupRequest = {
  pickup_location?: string;
  [key: string]: unknown;
};

export type ShiprocketAddPickupResponse = {
  message: string;
  success: boolean;
  address: { id: number; pickup_location: string };
};
