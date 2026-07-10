export interface CategoryQuestion {
  key: string;
  label: string;
  placeholder: string;
  required?: boolean;
}

type CategoryGroup =
  | 'food' | 'beverages' | 'electronics' | 'fashion' | 'beauty'
  | 'home' | 'construction' | 'agriculture' | 'healthcare'
  | 'automotive' | 'industrial' | 'office' | 'leisure' | 'general';

const BUSINESS_TYPE_TO_GROUP: Record<string, CategoryGroup> = {
  'Grocery & FMCG': 'food', 'Cereals & Grains': 'food', 'Dairy Products': 'food',
  'Meat & Poultry': 'food', 'Fish & Seafood': 'food', 'Fruits & Vegetables': 'food',
  'Bakery & Confectionery': 'food', 'Spices & Condiments': 'food',
  'Cooking Oil & Fats': 'food', 'Organic & Health Foods': 'food', 'Baby & Infant Food': 'food',
  'Food Processing & Manufacturing': 'food',

  'Beverages & Soft Drinks': 'beverages', 'Water & Bottled Drinks': 'beverages',
  'Wines, Spirits & Alcohol': 'beverages', 'Tobacco & Cigarettes': 'beverages',

  'Electronics & Home Appliances': 'electronics', 'Mobile Phones & Accessories': 'electronics',
  'Computer Hardware & Software': 'electronics', 'Solar Energy & Electrical Goods': 'electronics',
  'TV, Audio & Entertainment Systems': 'electronics',

  'Clothing & Fashion': 'fashion', 'Shoes & Footwear': 'fashion',
  'Textiles & Fabrics': 'fashion', 'Bags & Luggage': 'fashion',
  'Jewellery & Accessories': 'fashion', 'Watches & Clocks': 'fashion',

  'Beauty & Cosmetics': 'beauty', 'Perfumes & Fragrances': 'beauty',
  'Hair Products & Wigs': 'beauty', 'Sanitary & Hygiene Products': 'beauty',

  'Furniture & Home Décor': 'home', 'Household Items & Utensils': 'home',
  'Bedding & Linen': 'home', 'Cleaning Products & Supplies': 'home',
  'Glass, Ceramics & Pottery': 'home',

  'Hardware & Construction Materials': 'construction', 'Electrical & Plumbing Supplies': 'construction',
  'Paints & Coatings': 'construction', 'Roofing & Waterproofing Materials': 'construction',
  'Tiles, Floors & Surfaces': 'construction', 'Steel & Metal Products': 'construction',
  'Timber & Wood Products': 'construction',

  'Agriculture & Farming Supplies': 'agriculture', 'Seeds & Fertilizers': 'agriculture',
  'Pesticides & Agrochemicals': 'agriculture', 'Irrigation & Water Systems': 'agriculture',
  'Farm Machinery & Equipment': 'agriculture', 'Livestock & Animal Products': 'agriculture',
  'Veterinary & Animal Health Supplies': 'agriculture', 'Poultry Farming Supplies': 'agriculture',
  'Fish Farming & Aquaculture': 'agriculture',

  'Pharmacy & Medicines': 'healthcare', 'Medical Equipment & Supplies': 'healthcare',
  'Optical & Eye Care Products': 'healthcare', 'Dental Supplies': 'healthcare',
  'Nutritional Supplements & Vitamins': 'healthcare', 'Disability & Mobility Aids': 'healthcare',

  'Auto Parts & Accessories': 'automotive', 'Tyres & Wheels': 'automotive',
  'Lubricants & Engine Oils': 'automotive', 'Vehicle Care Products': 'automotive',
  'Motorcycle Parts & Accessories': 'automotive',

  'Industrial Equipment & Machinery': 'industrial', 'Petroleum & Fuel Products': 'industrial',
  'Gas & Cooking Fuel': 'industrial', 'Packaging Materials': 'industrial',
  'Safety & Protective Equipment': 'industrial', 'Tools & Workshop Supplies': 'industrial',
  'Welding & Fabrication Supplies': 'industrial', 'Generator & Power Equipment': 'industrial',

  'Education & Stationery': 'office', 'Books & Publications': 'office',
  'Office Supplies & Equipment': 'office', 'Printing & Advertising Materials': 'office',
  'School & College Supplies': 'office',

  'Sports & Recreation Equipment': 'leisure', 'Music Instruments & Accessories': 'leisure',
  'Photography & Video Equipment': 'leisure', 'Toys & Games': 'leisure',
  'Art & Craft Supplies': 'leisure', 'Gift & Novelty Items': 'leisure',
  'Pet Supplies & Accessories': 'leisure',

  'Catering & Event Supplies': 'general', 'Hospitality & Hotel Supplies': 'general',
  'Religious & Cultural Articles': 'general', 'Travel & Tourism Supplies': 'general',
  'Import & Export Trading': 'general', 'General Trading': 'general', 'Other': 'general',
};

const LOCATION_QUESTION: CategoryQuestion = {
  key: 'location',
  label: 'Business Location',
  placeholder: 'e.g. Nairobi CBD, Mombasa, Nakuru town',
  required: true,
};

const QUESTIONS_BY_GROUP: Record<CategoryGroup, CategoryQuestion[]> = {
  food: [
    { key: 'brand', label: 'Brand / Manufacturer', placeholder: 'e.g. Delmonte, Bidco, local/unbranded' },
    { key: 'packSize', label: 'Pack Size / Weight per Unit', placeholder: 'e.g. 2 kg bag, 1 litre, 24-pack of 500g', required: true },
    { key: 'origin', label: 'Origin (local or imported)', placeholder: 'e.g. Kenyan, Ugandan, South African import' },
    { key: 'expiry', label: 'Expiry / Shelf Life', placeholder: 'e.g. 6+ months from today, manufactured this week' },
    { key: 'minOrder', label: 'Minimum Order', placeholder: 'e.g. 1 carton (12 bags), 5 kg minimum' },
    { key: 'delivery', label: 'Delivery / Pick-up', placeholder: 'e.g. Nairobi CBD, delivery within Nairobi for orders above KES 5,000' },
    LOCATION_QUESTION,
  ],
  beverages: [
    { key: 'brand', label: 'Brand', placeholder: 'e.g. Coca-Cola, Bidco, local' },
    { key: 'variant', label: 'Variant / Flavour', placeholder: 'e.g. Original, Mango, Assorted' },
    { key: 'packSize', label: 'Pack Size / Volume per Unit', placeholder: 'e.g. 500ml bottle, 24 × 330ml cans', required: true },
    { key: 'origin', label: 'Origin', placeholder: 'e.g. Kenyan, imported' },
    { key: 'minOrder', label: 'Minimum Order', placeholder: 'e.g. 1 crate (24 bottles)' },
    { key: 'delivery', label: 'Delivery / Pick-up', placeholder: 'e.g. Nairobi CBD, Mombasa delivery available' },
    LOCATION_QUESTION,
  ],
  electronics: [
    { key: 'brand', label: 'Brand', placeholder: 'e.g. Samsung, Tecno, Generic', required: true },
    { key: 'model', label: 'Model / Specification', placeholder: 'e.g. Galaxy A15, 32-inch FHD, 1.5HP' },
    { key: 'condition', label: 'Condition', placeholder: 'e.g. Brand new in box, UK-used, Refurbished', required: true },
    { key: 'warranty', label: 'Warranty', placeholder: 'e.g. 1-year manufacturer, 6 months shop, none' },
    { key: 'origin', label: 'Origin / Source', placeholder: 'e.g. Kenya, China, UK import, Dubai' },
    { key: 'delivery', label: 'Delivery / Pick-up', placeholder: 'e.g. Nairobi CBD, nationwide delivery' },
    LOCATION_QUESTION,
  ],
  fashion: [
    { key: 'brand', label: 'Brand', placeholder: 'e.g. Nike, Gucci, no-brand / unbranded' },
    { key: 'sizes', label: 'Sizes Available', placeholder: 'e.g. S, M, L, XL or 36–44', required: true },
    { key: 'colors', label: 'Colours / Variants', placeholder: 'e.g. Black, White, Assorted' },
    { key: 'material', label: 'Material / Fabric', placeholder: 'e.g. 100% cotton, polyester blend, genuine leather' },
    { key: 'condition', label: 'Condition', placeholder: 'e.g. New with tags, UK-used, Preloved' },
    { key: 'minOrder', label: 'Minimum Order', placeholder: 'e.g. 1 piece, 6 per size, 1 bale' },
    LOCATION_QUESTION,
  ],
  beauty: [
    { key: 'brand', label: 'Brand', placeholder: 'e.g. Nivea, Garnier, local/unbranded' },
    { key: 'variant', label: 'Variant / Shade', placeholder: 'e.g. Dark & Lovely Relaxer, SPF 50, shade 30' },
    { key: 'size', label: 'Size / Volume', placeholder: 'e.g. 200ml, 500g tub, 12-pack', required: true },
    { key: 'origin', label: 'Origin', placeholder: 'e.g. Made in Kenya, South Africa, imported' },
    { key: 'minOrder', label: 'Minimum Order', placeholder: 'e.g. 1 piece, 6 per SKU, 1 carton of 24' },
    { key: 'delivery', label: 'Delivery / Pick-up', placeholder: 'e.g. Nairobi, ship countrywide' },
    LOCATION_QUESTION,
  ],
  home: [
    { key: 'material', label: 'Material / Finish', placeholder: 'e.g. Stainless steel, hardwood, PVC, ceramic' },
    { key: 'dimensions', label: 'Dimensions / Size', placeholder: 'e.g. 120 × 60 cm, one-size, set of 6', required: true },
    { key: 'color', label: 'Colour / Design', placeholder: 'e.g. Black, Assorted, custom colour available' },
    { key: 'condition', label: 'Condition', placeholder: 'e.g. New, ex-display, second-hand' },
    { key: 'minOrder', label: 'Minimum Order', placeholder: 'e.g. 1 piece, 6-piece set, 1 carton' },
    { key: 'delivery', label: 'Delivery / Installation', placeholder: 'e.g. Pick-up only, delivery within Nairobi' },
    LOCATION_QUESTION,
  ],
  construction: [
    { key: 'specification', label: 'Specification / Grade', placeholder: 'e.g. Y12 deformed bar, Grade 425, 2mm gauge', required: true },
    { key: 'dimensions', label: 'Dimensions / Size', placeholder: 'e.g. 6-metre length, 3.6 × 1.2m sheet, 50 kg bag' },
    { key: 'brand', label: 'Brand / Manufacturer', placeholder: 'e.g. Bamburi, ARM, Athi River' },
    { key: 'origin', label: 'Origin', placeholder: 'e.g. Kenyan, China, India' },
    { key: 'minOrder', label: 'Minimum Order / Unit', placeholder: 'e.g. 50 bags, 1 tonne, per metre' },
    { key: 'delivery', label: 'Delivery / Transport', placeholder: 'e.g. Pick-up from yard, deliver at extra cost' },
    LOCATION_QUESTION,
  ],
  agriculture: [
    { key: 'productType', label: 'Product Type / Variety', placeholder: 'e.g. Hybrid Maize seed H614D, DAP fertiliser, sunflower', required: true },
    { key: 'brand', label: 'Brand / Manufacturer', placeholder: 'e.g. Kenya Seed, MEA Fertilisers, local farmer' },
    { key: 'packSize', label: 'Pack Size / Weight', placeholder: 'e.g. 2 kg packet, 50 kg bag, 1 litre bottle' },
    { key: 'certification', label: 'Certification / Registration', placeholder: 'e.g. KEPHIS certified, PCPB registered, none' },
    { key: 'minOrder', label: 'Minimum Order', placeholder: 'e.g. 10 bags, 1 drum, 5 litres' },
    { key: 'delivery', label: 'Delivery / Pick-up', placeholder: 'e.g. Nakuru town, delivery upcountry, farm gate' },
    LOCATION_QUESTION,
  ],
  healthcare: [
    { key: 'productName', label: 'Product / Active Ingredient', placeholder: 'e.g. Amoxicillin 500mg, BP monitor, multivitamin', required: true },
    { key: 'brand', label: 'Brand / Manufacturer', placeholder: 'e.g. Dawa Pharmaceuticals, Omron, generic' },
    { key: 'packSize', label: 'Pack Size / Volume', placeholder: 'e.g. 100 tablets, 200ml syrup, 10-strip' },
    { key: 'registration', label: 'PPB / Regulatory Registration', placeholder: 'e.g. PPB-registered, Class I medical device' },
    { key: 'storage', label: 'Storage / Handling', placeholder: 'e.g. Keep refrigerated, store below 25°C' },
    { key: 'delivery', label: 'Delivery / Pick-up', placeholder: 'e.g. Nairobi CBD pharmacy, nationwide distribution' },
    LOCATION_QUESTION,
  ],
  automotive: [
    { key: 'compatibility', label: 'Compatible Makes / Models', placeholder: 'e.g. Toyota Hilux 2015–2022, Universal fit', required: true },
    { key: 'partNumber', label: 'OEM / Part Number', placeholder: 'e.g. OEM 90912-02106, aftermarket alternative' },
    { key: 'brand', label: 'Brand', placeholder: 'e.g. Toyota genuine, Denso, aftermarket' },
    { key: 'condition', label: 'Condition', placeholder: 'e.g. Brand new, Genuine used, Reconditioned' },
    { key: 'origin', label: 'Origin / Source', placeholder: 'e.g. Japan import, China, Kenya local' },
    { key: 'delivery', label: 'Delivery / Pick-up', placeholder: 'e.g. Nairobi Industrial Area, nationwide courier' },
    LOCATION_QUESTION,
  ],
  industrial: [
    { key: 'specification', label: 'Specification / Capacity', placeholder: 'e.g. 5 KVA generator, 6mm MIG wire, 500L tank', required: true },
    { key: 'brand', label: 'Brand / Manufacturer', placeholder: 'e.g. Cummins, Einhell, local fabrication' },
    { key: 'condition', label: 'Condition', placeholder: 'e.g. New, used – good working order, Refurbished' },
    { key: 'certification', label: 'Standards / Certification', placeholder: 'e.g. CE marked, KEBS approved, ISO 9001' },
    { key: 'minOrder', label: 'Minimum Order / Lead Time', placeholder: 'e.g. 1 unit, 100 kg minimum, 2-week lead time' },
    { key: 'delivery', label: 'Delivery / Installation', placeholder: 'e.g. FOB Mombasa, delivery + installation Nairobi' },
    LOCATION_QUESTION,
  ],
  office: [
    { key: 'brand', label: 'Brand', placeholder: 'e.g. Bic, HP, Rexco, local' },
    { key: 'specification', label: 'Specification / Format', placeholder: 'e.g. A4 80gsm, 500-sheet ream, A5 notebook 96pg', required: true },
    { key: 'color', label: 'Colour / Design', placeholder: 'e.g. Blue, Black, Assorted, custom print' },
    { key: 'minOrder', label: 'Minimum Order', placeholder: 'e.g. 1 ream, 10 pieces, 1 carton of 5 reams' },
    { key: 'customisation', label: 'Custom Printing / Branding', placeholder: 'e.g. Custom logo available, plain only' },
    { key: 'delivery', label: 'Delivery / Pick-up', placeholder: 'e.g. Nairobi CBD, delivery countrywide' },
    LOCATION_QUESTION,
  ],
  leisure: [
    { key: 'brand', label: 'Brand', placeholder: 'e.g. Adidas, Casio, local/generic' },
    { key: 'specification', label: 'Specification / Model', placeholder: 'e.g. Size 5 football, 6-string acoustic, PS5 controller', required: true },
    { key: 'condition', label: 'Condition', placeholder: 'e.g. New, like new, used – good condition' },
    { key: 'ageGroup', label: 'Age Group / Audience', placeholder: 'e.g. Adults, kids 3–12, all ages' },
    { key: 'minOrder', label: 'Minimum Order', placeholder: 'e.g. 1 piece, 6 per box' },
    { key: 'delivery', label: 'Delivery / Pick-up', placeholder: 'e.g. Nairobi, ship countrywide' },
    LOCATION_QUESTION,
  ],
  general: [
    { key: 'brand', label: 'Brand / Supplier', placeholder: 'e.g. Own brand, imported, no-brand' },
    { key: 'specification', label: 'Key Specification / Feature', placeholder: 'Describe the main feature or spec', required: true },
    { key: 'condition', label: 'Condition', placeholder: 'e.g. New, used, refurbished' },
    { key: 'origin', label: 'Origin / Source', placeholder: 'e.g. Kenya, China, Europe, USA' },
    { key: 'minOrder', label: 'Minimum Order', placeholder: 'e.g. 1 piece, 5 units, 1 carton' },
    { key: 'delivery', label: 'Delivery / Pick-up', placeholder: 'e.g. Nairobi, delivery available' },
    LOCATION_QUESTION,
  ],
};

export function getQuestionsForBusinessType(businessType: string): CategoryQuestion[] {
  const group = BUSINESS_TYPE_TO_GROUP[businessType] ?? 'general';
  return QUESTIONS_BY_GROUP[group];
}

export function buildDescription(businessType: string, answers: Record<string, string>): string {
  const questions = getQuestionsForBusinessType(businessType);
  return questions
    .filter(q => answers[q.key]?.trim())
    .map(q => `${q.label}: ${answers[q.key].trim()}`)
    .join('\n');
}
