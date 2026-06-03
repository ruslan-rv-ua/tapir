/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ name: NonNullable<unknown> }} Station_Summary_PreviewingInputs */

const uk_station_summary_previewing = /** @type {(inputs: Station_Summary_PreviewingInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Відтворюється, ${i?.name}`)
};

const en_station_summary_previewing = /** @type {(inputs: Station_Summary_PreviewingInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Playing, ${i?.name}`)
};

/**
* | output |
* | --- |
* | "Playing, {name}" |
*
* @param {Station_Summary_PreviewingInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const station_summary_previewing = /** @type {((inputs: Station_Summary_PreviewingInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Station_Summary_PreviewingInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_station_summary_previewing(inputs)
	return en_station_summary_previewing(inputs)
});