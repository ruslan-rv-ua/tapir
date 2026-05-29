/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Songs_Filter_Station_LabelInputs */

const uk_songs_filter_station_label = /** @type {(inputs: Songs_Filter_Station_LabelInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Станція`)
};

const en_songs_filter_station_label = /** @type {(inputs: Songs_Filter_Station_LabelInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Station`)
};

/**
* | output |
* | --- |
* | "Station" |
*
* @param {Songs_Filter_Station_LabelInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const songs_filter_station_label = /** @type {((inputs?: Songs_Filter_Station_LabelInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Songs_Filter_Station_LabelInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_songs_filter_station_label(inputs)
	return en_songs_filter_station_label(inputs)
});