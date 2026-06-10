/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ name: NonNullable<unknown>, profile: NonNullable<unknown> }} Stream_Copied_To_ProfileInputs */

const uk_stream_copied_to_profile = /** @type {(inputs: Stream_Copied_To_ProfileInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`«${i?.name}» скопійовано в «${i?.profile}»`)
};

const en_stream_copied_to_profile = /** @type {(inputs: Stream_Copied_To_ProfileInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Copied “${i?.name}” to “${i?.profile}”`)
};

/**
* | output |
* | --- |
* | "Copied “{name}” to “{profile}”" |
*
* @param {Stream_Copied_To_ProfileInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const stream_copied_to_profile = /** @type {((inputs: Stream_Copied_To_ProfileInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Stream_Copied_To_ProfileInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_stream_copied_to_profile(inputs)
	return en_stream_copied_to_profile(inputs)
});