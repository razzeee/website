import { useEffect, useRef, useState } from "react"
import { Chart } from "react-chartjs-2"
import * as ChartGeo from "chartjs-chart-geo"
import {
    Chart as ChartJS,
    CategoryScale,
    Tooltip,
    Title,
    Legend,
} from "chart.js"
import topology from "world-atlas/countries-50m.json"
import { Topology } from "topojson-specification"

ChartJS.register(
    Title,
    Tooltip,
    Legend,
    CategoryScale,
    ChartGeo.ChoroplethController,
    ChartGeo.ProjectionScale,
    ChartGeo.ColorScale,
    ChartGeo.GeoFeature,
)

export default function WorldMap(props: { chosenKey: keyof typeof topology }) {
    const chartRef = useRef()

    console.log("topology", topology)

    const data = ChartGeo.topojson.feature(
        topology as Topology,
        (topology as Topology).objects.countries,
    ).features


    return (
        <Chart
            ref={chartRef}
            type="choropleth"
            data={{
                labels: data.map(
                    (d: any) => d.properties.name,
                ),
                datasets: [
                    {
                        outline: data,
                        label: "Countries",
                        data: data.map((d: any) => ({
                            feature: d,
                            value: Math.random() * 10,
                        })),
                        // backgroundColor: ["#94BA62", "#59A22F", "#1A830C"]
                    },
                ],
            }}
            options={{
                showOutline: true,
                showGraticule: true,
                plugins: {
                    legend: {
                        display: false,
                    },
                },
                scales: {
                    x: {
                        projection: "equalEarth",
                    },
                    // Hide color scale
                    // color: {
                    //   display: false
                    // }
                },
            }}
        />
    )
}
