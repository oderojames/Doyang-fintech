export const BUSINESS_TYPES = [
  // Food & Grocery
  'Grocery & FMCG',
  'Cereals & Grains',
  'Dairy Products',
  'Meat & Poultry',
  'Fish & Seafood',
  'Fruits & Vegetables',
  'Bakery & Confectionery',
  'Spices & Condiments',
  'Cooking Oil & Fats',
  'Organic & Health Foods',
  'Baby & Infant Food',

  // Beverages & Tobacco
  'Beverages & Soft Drinks',
  'Water & Bottled Drinks',
  'Wines, Spirits & Alcohol',
  'Tobacco & Cigarettes',

  // Electronics & Tech
  'Electronics & Home Appliances',
  'Mobile Phones & Accessories',
  'Computer Hardware & Software',
  'Solar Energy & Electrical Goods',
  'TV, Audio & Entertainment Systems',

  // Fashion & Apparel
  'Clothing & Fashion',
  'Shoes & Footwear',
  'Textiles & Fabrics',
  'Bags & Luggage',
  'Jewellery & Accessories',
  'Watches & Clocks',

  // Beauty & Personal Care
  'Beauty & Cosmetics',
  'Perfumes & Fragrances',
  'Hair Products & Wigs',
  'Sanitary & Hygiene Products',

  // Home & Living
  'Furniture & Home Décor',
  'Household Items & Utensils',
  'Bedding & Linen',
  'Cleaning Products & Supplies',
  'Glass, Ceramics & Pottery',

  // Construction & Hardware
  'Hardware & Construction Materials',
  'Electrical & Plumbing Supplies',
  'Paints & Coatings',
  'Roofing & Waterproofing Materials',
  'Tiles, Floors & Surfaces',
  'Steel & Metal Products',
  'Timber & Wood Products',

  // Agriculture
  'Agriculture & Farming Supplies',
  'Seeds & Fertilizers',
  'Pesticides & Agrochemicals',
  'Irrigation & Water Systems',
  'Farm Machinery & Equipment',
  'Livestock & Animal Products',
  'Veterinary & Animal Health Supplies',
  'Poultry Farming Supplies',
  'Fish Farming & Aquaculture',

  // Healthcare & Medical
  'Pharmacy & Medicines',
  'Medical Equipment & Supplies',
  'Optical & Eye Care Products',
  'Dental Supplies',
  'Nutritional Supplements & Vitamins',
  'Disability & Mobility Aids',

  // Automotive
  'Auto Parts & Accessories',
  'Tyres & Wheels',
  'Lubricants & Engine Oils',
  'Vehicle Care Products',
  'Motorcycle Parts & Accessories',

  // Industrial & Energy
  'Industrial Equipment & Machinery',
  'Petroleum & Fuel Products',
  'Gas & Cooking Fuel',
  'Packaging Materials',
  'Safety & Protective Equipment',
  'Tools & Workshop Supplies',
  'Welding & Fabrication Supplies',
  'Generator & Power Equipment',

  // Office & Education
  'Education & Stationery',
  'Books & Publications',
  'Office Supplies & Equipment',
  'Printing & Advertising Materials',
  'School & College Supplies',

  // Leisure & Lifestyle
  'Sports & Recreation Equipment',
  'Music Instruments & Accessories',
  'Photography & Video Equipment',
  'Toys & Games',
  'Art & Craft Supplies',
  'Gift & Novelty Items',
  'Pet Supplies & Accessories',

  // Services & Other
  'Catering & Event Supplies',
  'Hospitality & Hotel Supplies',
  'Religious & Cultural Articles',
  'Travel & Tourism Supplies',
  'Food Processing & Manufacturing',
  'Import & Export Trading',
  'General Trading',
  'Other',
] as const;

export type BusinessType = typeof BUSINESS_TYPES[number] | string;
