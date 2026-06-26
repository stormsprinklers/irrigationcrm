import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import {
  AddressAutocompleteError,
  resolveAddressPlace,
  searchAddressSuggestions,
} from "@/lib/customers/address-autocomplete";

export async function GET(request: NextRequest) {
  try {
    await requireSessionUser();

    const input = request.nextUrl.searchParams.get("input")?.trim();
    const placeId = request.nextUrl.searchParams.get("placeId")?.trim();

    if (placeId) {
      const address = await resolveAddressPlace(placeId);
      return NextResponse.json({ address });
    }

    if (!input) return badRequestResponse("input or placeId is required");

    const suggestions = await searchAddressSuggestions(input);
    return NextResponse.json({ suggestions });
  } catch (error) {
    if (error instanceof AddressAutocompleteError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return unauthorizedResponse();
  }
}
