import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Package,
  Plus,
  Trash2,
  FileText,
  RefreshCw
} from 'lucide-react';

// API Request helper
const apiRequest = async (url: string, options: RequestInit) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
};

// Create Receipt Dialog Component
function CreateReceiptDialog({ open, onOpenChange, onSuccess }: any) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [receiptType, setReceiptType] = useState<"po" | "manual">("manual");
  const [selectedPO, setSelectedPO] = useState<any>(null);
  const [showPOList, setShowPOList] = useState(false);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");
  const [selectedZoneId, setSelectedZoneId] = useState<string>("");
  const [formData, setFormData] = useState({
    poNumber: "",
    supplierName: "",
    warehouseLocation: "",
    receiptDate: new Date().toISOString().split("T")[0],
    notes: ""
  });
  const [items, setItems] = useState<any[]>([]);

  // Fetch open purchase orders
  const { data: openPOs = [], isLoading: posLoading } = useQuery({
    queryKey: ["/api/purchase-orders/open-orders"],
    enabled: receiptType === "po" && showPOList,
  });

  // Fetch inventory items for manual entry
  const { data: inventoryProducts = [] } = useQuery({
    queryKey: ["/api/inventory/items"],
  });

  // Fetch warehouses from Enhanced Location module
  const { data: warehousesData } = useQuery({
    queryKey: ["/api/enhanced-locations/warehouses"],
  });
  const warehouses = Array.isArray(warehousesData) ? warehousesData : [];

  // Fetch ALL zones from Enhanced Location module (not warehouse-specific)
  const { data: zonesData } = useQuery({
    queryKey: ["/api/enhanced-locations/zones"],
    enabled: warehouses.length > 0,
  });
  const zones = Array.isArray(zonesData) ? zonesData : [];

  // Fetch ALL bins from Enhanced Location module (not warehouse-specific)
  const { data: binsData } = useQuery({
    queryKey: ["/api/enhanced-locations/bins"],
    enabled: warehouses.length > 0,
  });
  const bins = Array.isArray(binsData) ? binsData : [];

  // Handle PO selection
  const handlePOSelect = async (po: any) => {
    setSelectedPO(po);
    setFormData({
      poNumber: po.poNumber,
      supplierName: po.vendorName,
      warehouseLocation: formData.warehouseLocation,
      receiptDate: formData.receiptDate,
      notes: ""
    });

    // Fetch PO items
    try {
      const response = await fetch(`/api/purchase-orders/${po.id}/items`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const itemsData = await response.json();

      console.log("PO Items Response:", itemsData);

      // Handle both array response and object with data property
      const items = Array.isArray(itemsData) ? itemsData : (itemsData.data || []);

      if (items.length === 0) {
        toast({
          title: "No Items",
          description: "This PO has no line items",
          variant: "destructive"
        });
        setShowPOList(false);
        return;
      }

      setItems(items.map((item: any) => ({
        productId: item.productId || item.product_id,
        productName: item.productName || item.itemName || item.item_name || item.product_name,
        sku: item.sku || item.skuNumber || item.sku_number,
        upc: item.upc || "",
        orderedQuantity: item.quantity || item.ordered_quantity || 0,
        receivedQuantity: item.quantity || item.ordered_quantity || 0,
        unitOfMeasure: item.unitOfMeasure || item.unit_of_measure || "units",
        location: "",
        warehouseId: "",
        zoneId: "",
        binId: "",
        condition: "good",
        batchNumber: "",
        expiryDate: "",
        notes: ""
      })));

      setShowPOList(false);
      toast({
        title: "PO Loaded",
        description: `Loaded ${items.length} items from ${po.poNumber}`
      });
    } catch (error: any) {
      console.error("Error loading PO items:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to load PO items",
        variant: "destructive"
      });
    }
  };

  // Add manual item
  const addManualItem = () => {
    setItems([...items, {
      productId: null,
      productName: "",
      sku: "",
      upc: "",
      orderedQuantity: 0,
      receivedQuantity: 0,
      unitOfMeasure: "units",
      location: "",
      warehouseId: "",
      zoneId: "",
      binId: "",
      condition: "good",
      batchNumber: "",
      expiryDate: "",
      notes: ""
    }]);
  };

  // Remove item
  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  // Update item field
  const updateItem = (index: number, field: string, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  // Handle product selection
  const handleProductSelect = (index: number, productId: string) => {
    const product = (inventoryProducts as any[]).find((p: any) => p.id === parseInt(productId));
    if (product) {
      updateItem(index, "productId", product.id);
      updateItem(index, "productName", product.productName);
      updateItem(index, "sku", product.skuNumber);
      updateItem(index, "upc", product.upc || "");
    }
  };

  const createReceiptMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("/api/inbound-receipts", {
        method: "POST",
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      toast({
        title: "Receipt Created",
        description: "Inbound receipt created successfully"
      });
      queryClient.invalidateQueries({ queryKey: ["/api/inbound-receipts"] });
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create receipt",
        variant: "destructive"
      });
    }
  });

  const handleSubmit = () => {
    if (!formData.supplierName) {
      toast({
        title: "Supplier Required",
        description: "Please enter a supplier name",
        variant: "destructive"
      });
      return;
    }

    if (items.length === 0) {
      toast({
        title: "No Items",
        description: "Please add at least one item",
        variant: "destructive"
      });
      return;
    }

    // Validate all items have required fields
    for (const item of items) {
      if (!item.productName || !item.receivedQuantity || item.receivedQuantity <= 0) {
        toast({
          title: "Invalid Item",
          description: "All items must have a product and quantity > 0",
          variant: "destructive"
        });
        return;
      }
    }

    createReceiptMutation.mutate({
      receiptData: formData,
      items: items
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Inbound Receipt</DialogTitle>
        </DialogHeader>

        <Tabs value={receiptType} onValueChange={(v) => setReceiptType(v as "po" | "manual")} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual">Manual Entry</TabsTrigger>
            <TabsTrigger value="po">From Purchase Order</TabsTrigger>
          </TabsList>

          {/* Manual Entry Tab */}
          <TabsContent value="manual" className="space-y-6">
            {/* Receipt Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Receipt Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Supplier Name *</Label>
                    <Input
                      value={formData.supplierName}
                      onChange={(e) => setFormData({ ...formData, supplierName: e.target.value })}
                      placeholder="Enter supplier name"
                    />
                  </div>
                  <div>
                    <Label>PO Number (Optional)</Label>
                    <Input
                      value={formData.poNumber}
                      onChange={(e) => setFormData({ ...formData, poNumber: e.target.value })}
                      placeholder="PO-2024-001"
                    />
                  </div>
                  <div>
                    <Label>Receipt Date *</Label>
                    <Input
                      type="date"
                      value={formData.receiptDate}
                      onChange={(e) => setFormData({ ...formData, receiptDate: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Notes</Label>
                    <Input
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Additional notes"
                    />
                  </div>
                  <div>
                    <Label>Warehouse</Label>
                    <Select
                      value={formData.warehouseLocation}
                      onValueChange={(value) => {
                        const warehouse = (warehouses as any[]).find((w: any) => w.name === value);
                        setFormData({ ...formData, warehouseLocation: value });
                        setSelectedWarehouseId(warehouse?.id || "");
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select warehouse" />
                      </SelectTrigger>
                      <SelectContent>
                        {(warehouses as any[]).map((warehouse: any) => (
                          <SelectItem key={warehouse.id} value={warehouse.name}>
                            {warehouse.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Items Section */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Items ({items.length})</CardTitle>
                  <Button onClick={addManualItem} size="sm" className="bg-green-600 hover:bg-green-700">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Item
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {items.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Package className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                    <p>No items added yet</p>
                    <p className="text-sm mt-1">Click "Add Item" to start adding products</p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-96 overflow-y-auto">
                    {items.map((item, index) => (
                      <div key={index} className="p-4 border rounded-lg bg-gray-50 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm">Item {index + 1}</p>
                            {item.productName && (
                              <div className="mt-1">
                                <p className="font-medium">{item.productName}</p>
                                <p className="text-sm text-gray-600">SKU: {item.sku}</p>
                              </div>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeItem(index)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="grid grid-cols-4 gap-3">
                          <div className="col-span-2">
                            <Label className="text-xs">Product *</Label>
                            <Select
                              value={item.productId?.toString() || ""}
                              onValueChange={(value) => handleProductSelect(index, value)}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Select product" />
                              </SelectTrigger>
                              <SelectContent>
                                {(inventoryProducts as any[]).map((product: any) => (
                                  <SelectItem key={product.id} value={product.id.toString()}>
                                    {product.productName} - {product.skuNumber}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label className="text-xs">Quantity *</Label>
                            <Input
                              type="number"
                              value={item.receivedQuantity}
                              onChange={(e) => updateItem(index, "receivedQuantity", parseInt(e.target.value) || 0)}
                              className="h-9"
                              min="0"
                            />
                          </div>

                          <div>
                            <Label className="text-xs">Condition</Label>
                            <Select
                              value={item.condition}
                              onValueChange={(value) => updateItem(index, "condition", value)}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="good">Good</SelectItem>
                                <SelectItem value="damaged">Damaged</SelectItem>
                                <SelectItem value="expired">Expired</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <Label className="text-xs">Warehouse *</Label>
                            <Select
                              value={item.warehouseId}
                              onValueChange={(value) => {
                                updateItem(index, "warehouseId", value);
                                updateItem(index, "zoneId", "");
                                updateItem(index, "binId", "");
                              }}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Select warehouse" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="RECEIVING">Receiving Dock</SelectItem>
                                <SelectItem value="HOLDING">Holding Area</SelectItem>
                                {(warehouses as any[]).map((warehouse: any) => (
                                  <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                                    {warehouse.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label className="text-xs">Zone</Label>
                            <Select
                              value={item.zoneId}
                              onValueChange={(value) => {
                                updateItem(index, "zoneId", value);
                                updateItem(index, "binId", "");
                              }}
                              disabled={!item.warehouseId || item.warehouseId === "RECEIVING" || item.warehouseId === "HOLDING"}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Select zone" />
                              </SelectTrigger>
                              <SelectContent>
                                {item.warehouseId && (zones as any[])
                                  .filter((z: any) => z.warehouseId?.toString() === item.warehouseId?.toString())
                                  .map((zone: any) => (
                                    <SelectItem key={zone.id} value={zone.id.toString()}>
                                      {zone.name}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label className="text-xs">Bin Location</Label>
                            <Select
                              value={item.binId}
                              onValueChange={(value) => updateItem(index, "binId", value)}
                              disabled={!item.warehouseId || item.warehouseId === "RECEIVING" || item.warehouseId === "HOLDING"}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Select bin" />
                              </SelectTrigger>
                              <SelectContent>
                                {item.warehouseId && (bins as any[])
                                  .filter((b: any) =>
                                    b.warehouseId?.toString() === item.warehouseId?.toString() &&
                                    (!item.zoneId || b.zoneId?.toString() === item.zoneId?.toString())
                                  )
                                  .map((bin: any) => (
                                    <SelectItem key={bin.id} value={bin.id.toString()}>
                                      {bin.binNumber}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <Label className="text-xs">Batch/Lot #</Label>
                            <Input
                              value={item.batchNumber}
                              onChange={(e) => updateItem(index, "batchNumber", e.target.value)}
                              placeholder="LOT-001"
                              className="h-9"
                            />
                          </div>

                          <div>
                            <Label className="text-xs">Expiry Date</Label>
                            <Input
                              type="date"
                              value={item.expiryDate}
                              onChange={(e) => updateItem(index, "expiryDate", e.target.value)}
                              className="h-9"
                            />
                          </div>

                          <div>
                            <Label className="text-xs">UOM</Label>
                            <Input
                              value={item.unitOfMeasure}
                              onChange={(e) => updateItem(index, "unitOfMeasure", e.target.value)}
                              placeholder="units"
                              className="h-9"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={createReceiptMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {createReceiptMutation.isPending ? "Creating..." : "Create Receipt"}
              </Button>
            </div>
          </TabsContent>

          {/* Purchase Order Tab */}
          <TabsContent value="po" className="space-y-6">
            {!selectedPO ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Select Purchase Order</CardTitle>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={() => setShowPOList(true)}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    View Open Purchase Orders
                  </Button>

                  {showPOList && (
                    <div className="mt-4 space-y-2 max-h-96 overflow-y-auto">
                      {posLoading ? (
                        <div className="flex justify-center py-8">
                          <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
                        </div>
                      ) : (openPOs as any[]).length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                          <Package className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                          <p>No open purchase orders found</p>
                        </div>
                      ) : (
                        (openPOs as any[]).map((po: any) => (
                          <div
                            key={po.id}
                            className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                            onClick={() => handlePOSelect(po)}
                          >
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium text-lg">{po.poNumber}</p>
                                  <p className="text-sm text-gray-600">Vendor: {po.vendorName}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm text-gray-500">
                                    Expected: {new Date(po.expectedDeliveryDate || po.createdAt).toLocaleDateString()}
                                  </p>
                                  <Badge className="bg-yellow-100 text-yellow-800">
                                    {po.status || "Open"}
                                  </Badge>
                                </div>
                              </div>

                              {/* Contract Manufacturer */}
                              {po.contractManufacturer && (
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="text-gray-600">Contract Mfg:</span>
                                  <span className="font-medium">{po.contractManufacturer}</span>
                                </div>
                              )}

                              {/* Product Information */}
                              {po.productName && (
                                <div className="flex items-center gap-2 text-sm">
                                  <Package className="h-4 w-4 text-gray-400" />
                                  <span className="text-gray-700">{po.productName}</span>
                                  {po.itemCount > 1 && (
                                    <Badge variant="outline" className="text-xs">
                                      +{po.itemCount - 1} more items
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">Selected PO: {selectedPO.poNumber}</CardTitle>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedPO(null);
                          setItems([]);
                        }}
                      >
                        Change PO
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label>Receipt Date *</Label>
                        <Input
                          type="date"
                          value={formData.receiptDate}
                          onChange={(e) => setFormData({ ...formData, receiptDate: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Warehouse</Label>
                        <Select
                          value={formData.warehouseLocation}
                          onValueChange={(value) => {
                            const warehouse = (warehouses as any[]).find((w: any) => w.name === value);
                            setFormData({ ...formData, warehouseLocation: value });
                            setSelectedWarehouseId(warehouse?.id || "");
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select warehouse" />
                          </SelectTrigger>
                          <SelectContent>
                            {(warehouses as any[]).map((warehouse: any) => (
                              <SelectItem key={warehouse.id} value={warehouse.name}>
                                {warehouse.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Notes</Label>
                        <Input
                          value={formData.notes}
                          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                          placeholder="Additional notes"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Items to Receive ({items.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4 max-h-96 overflow-y-auto">
                      {items.map((item, index) => (
                        <div key={index} className="p-4 border rounded-lg bg-gray-50 space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{item.productName}</p>
                              <p className="text-sm text-gray-600">SKU: {item.sku}</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-4 gap-3">
                            <div>
                              <Label className="text-xs">Ordered Qty</Label>
                              <Input
                                type="number"
                                value={item.orderedQuantity}
                                readOnly
                                className="h-9 bg-gray-100"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Received Qty *</Label>
                              <Input
                                type="number"
                                value={item.receivedQuantity}
                                onChange={(e) => updateItem(index, "receivedQuantity", parseInt(e.target.value) || 0)}
                                className="h-9"
                                min="0"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Condition</Label>
                              <Select
                                value={item.condition}
                                onValueChange={(value) => updateItem(index, "condition", value)}
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="good">Good</SelectItem>
                                  <SelectItem value="damaged">Damaged</SelectItem>
                                  <SelectItem value="expired">Expired</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <Label className="text-xs">Warehouse *</Label>
                              <Select
                                value={item.warehouseId}
                                onValueChange={(value) => {
                                  updateItem(index, "warehouseId", value);
                                  updateItem(index, "zoneId", "");
                                  updateItem(index, "binId", "");
                                }}
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue placeholder="Select warehouse" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="RECEIVING">Receiving Dock</SelectItem>
                                  <SelectItem value="HOLDING">Holding Area</SelectItem>
                                  {(warehouses as any[]).map((warehouse: any) => (
                                    <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                                      {warehouse.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div>
                              <Label className="text-xs">Zone</Label>
                              <Select
                                value={item.zoneId}
                                onValueChange={(value) => {
                                  updateItem(index, "zoneId", value);
                                  updateItem(index, "binId", "");
                                }}
                                disabled={!item.warehouseId || item.warehouseId === "RECEIVING" || item.warehouseId === "HOLDING"}
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue placeholder="Select zone" />
                                </SelectTrigger>
                                <SelectContent>
                                  {item.warehouseId && (zones as any[])
                                    .filter((z: any) => z.warehouseId?.toString() === item.warehouseId?.toString())
                                    .map((zone: any) => (
                                      <SelectItem key={zone.id} value={zone.id.toString()}>
                                        {zone.name}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div>
                              <Label className="text-xs">Bin Location</Label>
                              <Select
                                value={item.binId}
                                onValueChange={(value) => updateItem(index, "binId", value)}
                                disabled={!item.warehouseId || item.warehouseId === "RECEIVING" || item.warehouseId === "HOLDING"}
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue placeholder="Select bin" />
                                </SelectTrigger>
                                <SelectContent>
                                  {item.warehouseId && (bins as any[])
                                    .filter((b: any) =>
                                      b.warehouseId?.toString() === item.warehouseId?.toString() &&
                                      (!item.zoneId || b.zoneId?.toString() === item.zoneId?.toString())
                                    )
                                    .map((bin: any) => (
                                      <SelectItem key={bin.id} value={bin.id.toString()}>
                                        {bin.binNumber}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <Label className="text-xs">Batch/Lot #</Label>
                              <Input
                                value={item.batchNumber}
                                onChange={(e) => updateItem(index, "batchNumber", e.target.value)}
                                placeholder="LOT-001"
                                className="h-9"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Expiry Date</Label>
                              <Input
                                type="date"
                                value={item.expiryDate}
                                onChange={(e) => updateItem(index, "expiryDate", e.target.value)}
                                className="h-9"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Notes</Label>
                              <Input
                                value={item.notes}
                                onChange={(e) => updateItem(index, "notes", e.target.value)}
                                placeholder="Item notes"
                                className="h-9"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={createReceiptMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {createReceiptMutation.isPending ? "Creating..." : "Create Receipt"}
                  </Button>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// Main App Component
const App: React.FC = () => {
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleSuccess = () => {
    setDialogOpen(false);
    // Handle success (refresh data, show notification, etc.)
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white p-8 rounded-lg shadow-md">
          <h1 className="text-3xl font-bold mb-4">SwiftSupport - Inbound Receipt Management</h1>
          <p className="text-gray-600 mb-6">
            Create and manage inbound receipts for your warehouse operations.
          </p>

          <Button
            onClick={() => setDialogOpen(true)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Inbound Receipt
          </Button>
        </div>

        <CreateReceiptDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSuccess={handleSuccess}
        />
      </div>
    </div>
  );
};

export default App;
