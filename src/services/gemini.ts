import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const leadFinderSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING },
      contact: { type: Type.STRING },
      serviceNeeded: { type: Type.STRING },
    },
    required: ["name", "contact", "serviceNeeded"],
  },
};

export const campaignSchema = {
  type: Type.OBJECT,
  properties: {
    posts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          platform: { type: Type.STRING },
          caption: { type: Type.STRING },
          hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
          imageIdea: { type: Type.STRING },
        },
      },
    },
    adCopy: { type: Type.STRING },
    schedule: { type: Type.STRING },
  },
};

export async function findLeads(businessType: string, location: string) {
  const prompt = `Search for potential leads for a ${businessType} business in ${location}. 
  Return a list of people who might need these services based on social media trends and local needs.
  Format as a JSON array of objects with name, contact (handle or email), and serviceNeeded.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash-exp",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: leadFinderSchema,
    },
  });

  return JSON.parse(response.text || "[]");
}

export async function generateOutreach(leadName: string, businessName: string, serviceNeeded: string) {
  const prompt = `Write a personalized, friendly, and professional outreach message for ${leadName}. 
  The business is ${businessName} and they need ${serviceNeeded}. 
  Keep it short and convincing for WhatsApp or Instagram DM.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash-exp",
    contents: prompt,
  });

  return response.text;
}

export async function generateCampaign(businessName: string, businessInfo: string) {
  const prompt = `Generate a marketing campaign for ${businessName}. 
  Business info: ${businessInfo}. 
  Include 3 social media posts with captions and image ideas, ad copy, and a posting schedule.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash-exp",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: campaignSchema,
    },
  });

  return JSON.parse(response.text || "{}");
}
